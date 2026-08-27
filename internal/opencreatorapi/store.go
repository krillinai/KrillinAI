package opencreatorapi

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

var (
	ErrTaskNotFound        = errors.New("task_not_found")
	ErrIdempotencyKeyReuse = errors.New("idempotency_key_reused")
)

type storedTask struct {
	Task             Task                   `json:"task"`
	IdempotencyKey   string                 `json:"idempotencyKey"`
	RequestHash      string                 `json:"requestHash"`
	InputArtifactIDs []string               `json:"inputArtifactIds"`
	Options          map[string]interface{} `json:"options"`
}

type Store struct {
	mu          sync.Mutex
	guard       *PathGuard
	tasks       map[string]*storedTask
	idempotency map[string]string
	events      map[string][]TaskEvent
	cancels     map[string]context.CancelFunc
}

func NewStore(guard *PathGuard) (*Store, error) {
	store := &Store{
		guard:       guard,
		tasks:       make(map[string]*storedTask),
		idempotency: make(map[string]string),
		events:      make(map[string][]TaskEvent),
		cancels:     make(map[string]context.CancelFunc),
	}
	if err := store.load(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) Create(req CreateTaskRequest) (Task, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := req.JobID + "\x00" + req.IdempotencyKey
	if existingID, ok := s.idempotency[key]; ok {
		existing := s.tasks[existingID]
		if existing.RequestHash != req.RequestHash {
			return Task{}, false, ErrIdempotencyKeyReuse
		}
		return existing.Task, true, nil
	}
	now := time.Now().UTC()
	id, err := randomID("task")
	if err != nil {
		return Task{}, false, err
	}
	record := &storedTask{
		Task: Task{
			ID:           id,
			JobID:        req.JobID,
			StageRunID:   req.StageRunID,
			StageType:    req.StageType,
			Status:       StatusQueued,
			LastEventSeq: 0,
			CreatedAt:    now,
			UpdatedAt:    now,
		},
		IdempotencyKey:   req.IdempotencyKey,
		RequestHash:      req.RequestHash,
		InputArtifactIDs: append([]string(nil), req.InputArtifactIDs...),
		Options:          cloneMap(req.Options),
	}
	if err := s.persistRecord(record); err != nil {
		return Task{}, false, err
	}
	s.tasks[id] = record
	s.idempotency[key] = id
	if err := s.appendEventLocked(record, "status", map[string]interface{}{"status": StatusQueued}); err != nil {
		delete(s.tasks, id)
		delete(s.idempotency, key)
		return Task{}, false, err
	}
	return record.Task, false, nil
}

func (s *Store) Get(taskID string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record := s.tasks[taskID]
	if record == nil {
		return Task{}, ErrTaskNotFound
	}
	return record.Task, nil
}

func (s *Store) Record(taskID string) (storedTask, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record := s.tasks[taskID]
	if record == nil {
		return storedTask{}, ErrTaskNotFound
	}
	copy := *record
	copy.InputArtifactIDs = append([]string(nil), record.InputArtifactIDs...)
	copy.Options = cloneMap(record.Options)
	return copy, nil
}

func (s *Store) Events(taskID string, afterSeq int64) (TaskEventsResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tasks[taskID] == nil {
		return TaskEventsResponse{}, ErrTaskNotFound
	}
	result := make([]TaskEvent, 0)
	for _, event := range s.events[taskID] {
		if event.Seq > afterSeq {
			result = append(result, event)
		}
	}
	next := afterSeq
	if len(result) > 0 {
		next = result[len(result)-1].Seq
	} else if task := s.tasks[taskID]; task != nil && task.Task.LastEventSeq > next {
		next = task.Task.LastEventSeq
	}
	return TaskEventsResponse{Events: result, NextSeq: next}, nil
}

func (s *Store) Start(taskID string, cancel context.CancelFunc) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record := s.tasks[taskID]
	if record == nil {
		return Task{}, ErrTaskNotFound
	}
	if record.Task.Status != StatusQueued {
		return record.Task, nil
	}
	s.cancels[taskID] = cancel
	if err := s.transitionLocked(record, StatusRunning, nil, "status", map[string]interface{}{"status": StatusRunning}); err != nil {
		delete(s.cancels, taskID)
		return Task{}, err
	}
	return record.Task, nil
}

func (s *Store) Progress(taskID, phase string, percent int, message string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record := s.tasks[taskID]
	if record == nil {
		return Task{}, ErrTaskNotFound
	}
	if record.Task.Status != StatusRunning {
		return record.Task, nil
	}
	if percent < 0 {
		percent = 0
	}
	if percent > 100 {
		percent = 100
	}
	payload := map[string]interface{}{
		"phase":   phase,
		"percent": percent,
		"message": message,
	}
	if events := s.events[taskID]; len(events) > 0 {
		last := events[len(events)-1]
		if last.Type == "progress" &&
			fmt.Sprint(last.Payload["phase"]) == phase &&
			fmt.Sprint(last.Payload["percent"]) == fmt.Sprint(percent) &&
			fmt.Sprint(last.Payload["message"]) == message {
			return record.Task, nil
		}
	}
	if err := s.appendEventLocked(record, "progress", payload); err != nil {
		return Task{}, err
	}
	return record.Task, nil
}

func (s *Store) Complete(taskID, manifestID string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record := s.tasks[taskID]
	if record == nil {
		return Task{}, ErrTaskNotFound
	}
	if record.Task.Status == StatusCanceled {
		return record.Task, nil
	}
	if record.Task.Status != StatusRunning {
		return Task{}, fmt.Errorf("invalid task transition: %s to %s", record.Task.Status, StatusSucceeded)
	}
	record.Task.ResultManifestID = manifestID
	delete(s.cancels, taskID)
	if err := s.transitionLocked(record, StatusSucceeded, nil, "result", map[string]interface{}{
		"status": StatusSucceeded, "resultManifestId": manifestID,
	}); err != nil {
		return Task{}, err
	}
	return record.Task, nil
}

func (s *Store) Fail(taskID string, taskError TaskError) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record := s.tasks[taskID]
	if record == nil {
		return Task{}, ErrTaskNotFound
	}
	if record.Task.Status == StatusCanceled {
		return record.Task, nil
	}
	if record.Task.Status != StatusRunning && record.Task.Status != StatusQueued {
		return record.Task, nil
	}
	delete(s.cancels, taskID)
	if err := s.transitionLocked(record, StatusFailed, &taskError, "error", map[string]interface{}{
		"status": StatusFailed, "error": taskError,
	}); err != nil {
		return Task{}, err
	}
	return record.Task, nil
}

func (s *Store) Cancel(taskID string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record := s.tasks[taskID]
	if record == nil {
		return Task{}, ErrTaskNotFound
	}
	if isTerminal(record.Task.Status) {
		return record.Task, nil
	}
	if cancel := s.cancels[taskID]; cancel != nil {
		cancel()
	}
	delete(s.cancels, taskID)
	if err := s.transitionLocked(record, StatusCanceled, nil, "status", map[string]interface{}{"status": StatusCanceled}); err != nil {
		return Task{}, err
	}
	return record.Task, nil
}

func (s *Store) Result(taskID string) (ResultManifest, error) {
	s.mu.Lock()
	record := s.tasks[taskID]
	if record == nil {
		s.mu.Unlock()
		return ResultManifest{}, ErrTaskNotFound
	}
	if record.Task.Status != StatusSucceeded || record.Task.ResultManifestID == "" {
		s.mu.Unlock()
		return ResultManifest{}, errors.New("result_not_ready")
	}
	dir, err := s.guard.TaskDir(record.Task.JobID, record.Task.ID)
	s.mu.Unlock()
	if err != nil {
		return ResultManifest{}, err
	}
	data, err := os.ReadFile(filepath.Join(dir, "result-manifest.json"))
	if err != nil {
		return ResultManifest{}, err
	}
	var manifest ResultManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return ResultManifest{}, err
	}
	return manifest, nil
}

func (s *Store) transitionLocked(record *storedTask, status TaskStatus, taskError *TaskError, eventType string, payload map[string]interface{}) error {
	record.Task.Status = status
	record.Task.Error = taskError
	record.Task.UpdatedAt = time.Now().UTC()
	return s.appendEventLocked(record, eventType, payload)
}

func (s *Store) appendEventLocked(record *storedTask, eventType string, payload map[string]interface{}) error {
	event := TaskEvent{
		TaskID:    record.Task.ID,
		Seq:       record.Task.LastEventSeq + 1,
		Type:      eventType,
		Payload:   payload,
		CreatedAt: time.Now().UTC(),
	}
	record.Task.LastEventSeq = event.Seq
	record.Task.UpdatedAt = event.CreatedAt
	events := append(append([]TaskEvent(nil), s.events[record.Task.ID]...), event)
	if err := s.persistEvents(record, events); err != nil {
		return err
	}
	if err := s.persistRecord(record); err != nil {
		return err
	}
	s.events[record.Task.ID] = events
	return nil
}

func (s *Store) persistRecord(record *storedTask) error {
	dir, err := s.guard.TaskDir(record.Task.JobID, record.Task.ID)
	if err != nil {
		return err
	}
	return atomicWriteJSON(filepath.Join(dir, "task.json"), record)
}

func (s *Store) persistEvents(record *storedTask, events []TaskEvent) error {
	dir, err := s.guard.TaskDir(record.Task.JobID, record.Task.ID)
	if err != nil {
		return err
	}
	return atomicWriteJSON(filepath.Join(dir, "events.json"), events)
}

func (s *Store) load() error {
	jobs, err := os.ReadDir(s.guard.Root())
	if err != nil {
		return err
	}
	for _, job := range jobs {
		if !job.IsDir() || validateIdentifier(job.Name()) != nil {
			continue
		}
		tasksRoot := filepath.Join(s.guard.Root(), job.Name(), "krillin-tasks")
		tasks, err := os.ReadDir(tasksRoot)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		for _, entry := range tasks {
			if !entry.IsDir() || validateIdentifier(entry.Name()) != nil {
				continue
			}
			if err := s.loadTask(filepath.Join(tasksRoot, entry.Name())); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Store) loadTask(dir string) error {
	data, err := os.ReadFile(filepath.Join(dir, "task.json"))
	if err != nil {
		return err
	}
	var record storedTask
	if err := json.Unmarshal(data, &record); err != nil {
		return err
	}
	events := []TaskEvent{}
	if data, err = os.ReadFile(filepath.Join(dir, "events.json")); err == nil {
		if err := json.Unmarshal(data, &events); err != nil {
			return err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	s.tasks[record.Task.ID] = &record
	s.idempotency[record.Task.JobID+"\x00"+record.IdempotencyKey] = record.Task.ID
	s.events[record.Task.ID] = events
	if record.Task.Status == StatusRunning {
		return s.transitionLocked(&record, StatusInterrupted, &TaskError{
			Code: "service_restarted", Message: "KrillinAI service restarted while the task was running", Retryable: true,
		}, "error", map[string]interface{}{"status": StatusInterrupted, "code": "service_restarted"})
	}
	return nil
}

func atomicWriteJSON(path string, value interface{}) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), ".opencreator-*.tmp")
	if err != nil {
		return err
	}
	tempName := temp.Name()
	defer os.Remove(tempName)
	writer := bufio.NewWriter(temp)
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		temp.Close()
		return err
	}
	if err := writer.Flush(); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tempName, path); err != nil {
		return err
	}
	if dir, err := os.Open(filepath.Dir(path)); err == nil {
		_ = dir.Sync()
		_ = dir.Close()
	}
	return nil
}

func randomID(prefix string) (string, error) {
	value := make([]byte, 12)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(value), nil
}

func cloneMap(input map[string]interface{}) map[string]interface{} {
	if input == nil {
		return map[string]interface{}{}
	}
	data, _ := json.Marshal(input)
	var result map[string]interface{}
	_ = json.Unmarshal(data, &result)
	return result
}

func isTerminal(status TaskStatus) bool {
	return status == StatusSucceeded || status == StatusFailed || status == StatusCanceled || status == StatusInterrupted
}

func sortedTaskIDs(tasks map[string]*storedTask) []string {
	ids := make([]string, 0, len(tasks))
	for id := range tasks {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
