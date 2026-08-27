package opencreatorapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const testToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

type fakeRunner struct {
	block <-chan struct{}
}

func (r fakeRunner) Run(ctx context.Context, req CreateTaskRequest, workdir string, report ProgressReporter) (RunResult, error) {
	if report != nil {
		report("translating_subtitles", 45, "正在翻译字幕")
	}
	if r.block != nil {
		select {
		case <-r.block:
		case <-ctx.Done():
			return RunResult{}, ctx.Err()
		}
	}
	path := filepath.Join(workdir, "target.srt")
	if err := os.WriteFile(path, []byte("1\n00:00:00,000 --> 00:00:01,000\n你好\n"), 0600); err != nil {
		return RunResult{}, err
	}
	relative, err := filepath.Rel(filepath.Dir(filepath.Dir(filepath.Dir(workdir))), path)
	if err != nil {
		return RunResult{}, err
	}
	return RunResult{Artifacts: []ResultArtifact{{
		ID: req.StageRunID + "_target_subtitle", Kind: "target_subtitle", RelativePath: filepath.ToSlash(relative),
	}}, Metadata: map[string]interface{}{"captionSource": "test"}}, nil
}

func TestServerRequiresBearerAuthForEveryRoute(t *testing.T) {
	server, manager := newTestServer(t, fakeRunner{})
	defer manager.Close()
	for _, path := range []string{"/v1/health", "/v1/capabilities", "/v1/tasks/task_missing", "/api/config"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, req)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s status = %d, want 401", path, response.Code)
		}
	}
}

func TestCreateTaskIsIdempotentAndEventsResumeAfterCursor(t *testing.T) {
	server, manager := newTestServer(t, fakeRunner{})
	defer manager.Close()
	request := validRequest()
	first := callJSON(t, server.Handler(), http.MethodPost, "/v1/tasks", request, testToken)
	if first.Code != http.StatusAccepted {
		t.Fatalf("first create status = %d: %s", first.Code, first.Body.String())
	}
	var task Task
	decodeResponse(t, first, &task)
	waitForStatus(t, manager, task.ID, StatusSucceeded)

	replay := callJSON(t, server.Handler(), http.MethodPost, "/v1/tasks", request, testToken)
	if replay.Code != http.StatusOK {
		t.Fatalf("replay status = %d: %s", replay.Code, replay.Body.String())
	}
	var replayed Task
	decodeResponse(t, replay, &replayed)
	if replayed.ID != task.ID {
		t.Fatalf("replayed task id = %s, want %s", replayed.ID, task.ID)
	}

	events := callJSON(t, server.Handler(), http.MethodGet, "/v1/tasks/"+task.ID+"/events?afterSeq=1", nil, testToken)
	var page TaskEventsResponse
	decodeResponse(t, events, &page)
	if len(page.Events) < 2 || page.Events[0].Seq != 2 || page.NextSeq != page.Events[len(page.Events)-1].Seq {
		t.Fatalf("unexpected event page: %+v", page)
	}

	request.RequestHash = strings.Repeat("b", 64)
	conflict := callJSON(t, server.Handler(), http.MethodPost, "/v1/tasks", request, testToken)
	if conflict.Code != http.StatusConflict || !strings.Contains(conflict.Body.String(), "idempotency_key_reused") {
		t.Fatalf("conflict = %d: %s", conflict.Code, conflict.Body.String())
	}
}

func TestRunnerProgressIsPersistedInOrder(t *testing.T) {
	server, manager := newTestServer(t, fakeRunner{})
	defer manager.Close()
	response := callJSON(t, server.Handler(), http.MethodPost, "/v1/tasks", validRequest(), testToken)
	var task Task
	decodeResponse(t, response, &task)
	waitForStatus(t, manager, task.ID, StatusSucceeded)

	events, err := manager.Events(task.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(events.Events) != 4 {
		t.Fatalf("event count = %d, want 4: %+v", len(events.Events), events.Events)
	}
	progress := events.Events[2]
	if progress.Type != "progress" || progress.Payload["phase"] != "translating_subtitles" || progress.Payload["percent"] != 45 {
		t.Fatalf("progress event = %+v", progress)
	}
	for index, event := range events.Events {
		if event.Seq != int64(index+1) {
			t.Fatalf("event sequence at %d = %d", index, event.Seq)
		}
	}
}

func TestProviderConfigNeverPersistsAndResultPrecedesSuccess(t *testing.T) {
	root := t.TempDir()
	manager, err := NewManager(root, fakeRunner{})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	req := validRequest()
	req.ProviderConfig = map[string]interface{}{
		"transcription": map[string]interface{}{
			"provider": "openai",
			"openai":   map[string]interface{}{"apiKey": "super-secret-provider-key"},
		},
	}
	task, _, err := manager.Create(req)
	if err != nil {
		t.Fatal(err)
	}
	task = waitForStatus(t, manager, task.ID, StatusSucceeded)
	manifest, err := manager.Result(task.ID)
	if err != nil || manifest.ID != task.ResultManifestID {
		t.Fatalf("manifest must exist before succeeded is observable: %+v, %v", manifest, err)
	}
	err = filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info.IsDir() {
			return walkErr
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if bytes.Contains(data, []byte("super-secret-provider-key")) {
			t.Fatalf("provider secret persisted in %s", path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestCancelIsTerminalAndDoesNotAppendDuplicateEvent(t *testing.T) {
	block := make(chan struct{})
	manager, err := NewManager(t.TempDir(), fakeRunner{block: block})
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	task, _, err := manager.Create(validRequest())
	if err != nil {
		t.Fatal(err)
	}
	waitForStatus(t, manager, task.ID, StatusRunning)
	canceled, err := manager.Cancel(task.ID)
	if err != nil || canceled.Status != StatusCanceled {
		t.Fatalf("cancel = %+v, %v", canceled, err)
	}
	seq := canceled.LastEventSeq
	again, err := manager.Cancel(task.ID)
	if err != nil || again.LastEventSeq != seq {
		t.Fatalf("duplicate cancel changed terminal task: %+v, %v", again, err)
	}
}

func TestRestartInterruptsRunningTask(t *testing.T) {
	guard, err := NewPathGuard(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewStore(guard)
	if err != nil {
		t.Fatal(err)
	}
	task, _, err := store.Create(validRequest())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Start(task.ID, func() {}); err != nil {
		t.Fatal(err)
	}
	restarted, err := NewStore(guard)
	if err != nil {
		t.Fatal(err)
	}
	recovered, err := restarted.Get(task.ID)
	if err != nil || recovered.Status != StatusInterrupted {
		t.Fatalf("recovered = %+v, %v", recovered, err)
	}
	events, err := restarted.Events(task.ID, 0)
	if err != nil || fmt.Sprint(events.Events[len(events.Events)-1].Payload["status"]) != string(StatusInterrupted) {
		t.Fatalf("restart events = %+v, %v", events, err)
	}
}

func TestPathGuardRejectsAbsoluteEscapeAndCrossJobArtifact(t *testing.T) {
	guard, err := NewPathGuard(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	jobA, _ := guard.JobDir("job_a")
	jobB, _ := guard.JobDir("job_b")
	outside := filepath.Join(jobB, "video.mp4")
	if err := os.WriteFile(outside, []byte("video"), 0600); err != nil {
		t.Fatal(err)
	}
	index := artifactIndex{Artifacts: []artifactIndexEntry{{ID: "source_1", Kind: "source_video", RelativePath: outside}}}
	data, _ := json.Marshal(index)
	if err := os.WriteFile(filepath.Join(jobA, "artifact-index.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := guard.ResolveArtifact("job_a", "source_1"); err == nil {
		t.Fatal("absolute cross-job artifact path was accepted")
	}

	if err := os.Symlink(outside, filepath.Join(jobA, "linked.mp4")); err == nil {
		index.Artifacts[0].RelativePath = "linked.mp4"
		data, _ = json.Marshal(index)
		_ = os.WriteFile(filepath.Join(jobA, "artifact-index.json"), data, 0600)
		if _, _, err := guard.ResolveArtifact("job_a", "source_1"); err == nil {
			t.Fatal("symlink escape was accepted")
		}
	}
}

func newTestServer(t *testing.T, runner StageRunner) (*Server, *Manager) {
	t.Helper()
	manager, err := NewManager(t.TempDir(), runner)
	if err != nil {
		t.Fatal(err)
	}
	server, err := NewServer(ServerConfig{Token: testToken, ServiceVersion: "test", Generation: 1, Manager: manager})
	if err != nil {
		manager.Close()
		t.Fatal(err)
	}
	return server, manager
}

func validRequest() CreateTaskRequest {
	return CreateTaskRequest{
		ProtocolVersion: ProtocolVersion, JobID: "job_1", StageRunID: "stage_1", StageType: StageSubtitle,
		IdempotencyKey: "stage_1", RequestHash: strings.Repeat("a", 64), InputArtifactIDs: []string{},
		Options: map[string]interface{}{"sourceUrl": "https://www.youtube.com/watch?v=test"},
	}
}

func callJSON(t *testing.T, handler http.Handler, method, path string, body interface{}, token string) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(data)
	}
	req := httptest.NewRequest(method, path, reader)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	return response
}

func decodeResponse(t *testing.T, response *httptest.ResponseRecorder, value interface{}) {
	t.Helper()
	if err := json.Unmarshal(response.Body.Bytes(), value); err != nil {
		t.Fatalf("decode response: %v: %s", err, response.Body.String())
	}
}

func waitForStatus(t *testing.T, manager *Manager, taskID string, status TaskStatus) Task {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		task, err := manager.Get(taskID)
		if err == nil && task.Status == status {
			return task
		}
		time.Sleep(10 * time.Millisecond)
	}
	task, _ := manager.Get(taskID)
	t.Fatalf("task status = %s, want %s", task.Status, status)
	return Task{}
}
