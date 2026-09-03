package opencreatorapi

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"sync"
)

var requestHashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type workItem struct {
	request CreateTaskRequest
	taskID  string
}

type Manager struct {
	guard  *PathGuard
	store  *Store
	runner StageRunner
	queue  chan workItem
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewManager(jobsRoot string, runner StageRunner) (*Manager, error) {
	guard, err := NewPathGuard(jobsRoot)
	if err != nil {
		return nil, err
	}
	store, err := NewStore(guard)
	if err != nil {
		return nil, err
	}
	if runner == nil {
		runner = NewPipelineRunner(guard)
	}
	ctx, cancel := context.WithCancel(context.Background())
	manager := &Manager{
		guard: guard, store: store, runner: runner, queue: make(chan workItem, 64), ctx: ctx, cancel: cancel,
	}
	manager.wg.Add(1)
	go manager.worker()
	return manager, nil
}

func (m *Manager) Close() {
	m.cancel()
	m.wg.Wait()
}

func (m *Manager) Create(req CreateTaskRequest) (Task, bool, error) {
	if err := validateCreateRequest(req); err != nil {
		return Task{}, false, err
	}
	task, replay, err := m.store.Create(req)
	if err != nil {
		return task, replay, err
	}
	if replay && task.Status != StatusQueued {
		return task, true, nil
	}
	select {
	case m.queue <- workItem{request: req, taskID: task.ID}:
		return task, replay, nil
	case <-m.ctx.Done():
		_, _ = m.store.Fail(task.ID, TaskError{Code: "service_stopping", Message: "KrillinAI service is stopping", Retryable: true})
		return Task{}, false, errors.New("service is stopping")
	}
}

func (m *Manager) Get(taskID string) (Task, error) {
	return m.store.Get(taskID)
}

func (m *Manager) Events(taskID string, afterSeq int64) (TaskEventsResponse, error) {
	return m.store.Events(taskID, afterSeq)
}

func (m *Manager) Cancel(taskID string) (Task, error) {
	return m.store.Cancel(taskID)
}

func (m *Manager) Result(taskID string) (ResultManifest, error) {
	return m.store.Result(taskID)
}

func (m *Manager) worker() {
	defer m.wg.Done()
	for {
		select {
		case <-m.ctx.Done():
			return
		case item := <-m.queue:
			m.execute(item)
		}
	}
}

func (m *Manager) execute(item workItem) {
	ctx, cancel := context.WithCancel(m.ctx)
	task, err := m.store.Start(item.taskID, cancel)
	if err != nil || task.Status != StatusRunning {
		cancel()
		return
	}
	workdir, err := m.guard.StageWorkdir(task.JobID, task.StageRunID)
	if err != nil {
		cancel()
		_, _ = m.store.Fail(task.ID, TaskError{Code: "job_path_invalid", Message: err.Error(), Retryable: false})
		return
	}
	result, err := m.runner.Run(ctx, item.request, workdir, func(phase string, percent int, message string) {
		_, _ = m.store.Progress(task.ID, phase, percent, message)
	})
	cancel()
	if err != nil {
		if current, getErr := m.store.Get(task.ID); getErr == nil && current.Status == StatusCanceled {
			return
		}
		runErr := &RunError{Code: "krillin_stage_failed", Message: redactSecrets(err.Error()), Retryable: true}
		if errors.As(err, &runErr) {
			// Keep the typed error.
		}
		_, _ = m.store.Fail(task.ID, TaskError{Code: runErr.Code, Message: runErr.Message, Retryable: runErr.Retryable})
		return
	}
	manifest, err := newResultManifest(task, result)
	if err == nil {
		err = writeResultManifest(m.guard, task, manifest)
	}
	if err != nil {
		_, _ = m.store.Fail(task.ID, TaskError{Code: "result_manifest_write_failed", Message: err.Error(), Retryable: true})
		return
	}
	_, _ = m.store.Complete(task.ID, manifest.ID)
}

func validateCreateRequest(req CreateTaskRequest) error {
	if req.ProtocolVersion != ProtocolVersion {
		return &RunError{Code: "protocol_version_unsupported", Message: "protocolVersion must be 1", Retryable: false}
	}
	for _, value := range []string{req.JobID, req.StageRunID, req.IdempotencyKey} {
		if err := validateIdentifier(value); err != nil {
			return &RunError{Code: "invalid_identifier", Message: err.Error(), Retryable: false}
		}
	}
	if !requestHashPattern.MatchString(req.RequestHash) {
		return &RunError{Code: "invalid_request_hash", Message: "requestHash must be a lowercase SHA-256 value", Retryable: false}
	}
	foundStage := false
	for _, stage := range allStages() {
		if req.StageType == stage {
			foundStage = true
			break
		}
	}
	if !foundStage {
		return &RunError{Code: "stage_not_supported", Message: fmt.Sprintf("Unsupported stage: %s", req.StageType), Retryable: false}
	}
	seen := make(map[string]struct{}, len(req.InputArtifactIDs))
	for _, id := range req.InputArtifactIDs {
		if err := validateIdentifier(id); err != nil {
			return &RunError{Code: "invalid_identifier", Message: err.Error(), Retryable: false}
		}
		if _, exists := seen[id]; exists {
			return &RunError{Code: "duplicate_artifact_id", Message: "inputArtifactIds must be unique", Retryable: false}
		}
		seen[id] = struct{}{}
	}
	if req.Options == nil {
		return &RunError{Code: "invalid_options", Message: "options must be an object", Retryable: false}
	}
	return nil
}
