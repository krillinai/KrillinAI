package opencreatorapi

import "time"

const ProtocolVersion = 1

type StageType string

const (
	StageDownload         StageType = "download"
	StageSubtitle         StageType = "subtitle"
	StageTTS              StageType = "tts"
	StageRenderHorizontal StageType = "render-horizontal"
	StageRenderVertical   StageType = "render-vertical"
)

type TaskStatus string

const (
	StatusQueued      TaskStatus = "queued"
	StatusRunning     TaskStatus = "running"
	StatusSucceeded   TaskStatus = "succeeded"
	StatusFailed      TaskStatus = "failed"
	StatusCanceled    TaskStatus = "canceled"
	StatusInterrupted TaskStatus = "interrupted"
)

type CreateTaskRequest struct {
	ProtocolVersion  int                    `json:"protocolVersion"`
	JobID            string                 `json:"jobId"`
	StageRunID       string                 `json:"stageRunId"`
	StageType        StageType              `json:"stageType"`
	IdempotencyKey   string                 `json:"idempotencyKey"`
	RequestHash      string                 `json:"requestHash"`
	InputArtifactIDs []string               `json:"inputArtifactIds"`
	Options          map[string]interface{} `json:"options"`
	ProviderConfig   map[string]interface{} `json:"providerConfig,omitempty"`
}

type TaskError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

type Task struct {
	ID               string     `json:"id"`
	JobID            string     `json:"jobId"`
	StageRunID       string     `json:"stageRunId"`
	StageType        StageType  `json:"stageType"`
	Status           TaskStatus `json:"status"`
	LastEventSeq     int64      `json:"lastEventSeq"`
	ResultManifestID string     `json:"resultManifestId,omitempty"`
	Error            *TaskError `json:"error,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

type TaskEvent struct {
	TaskID    string                 `json:"taskId"`
	Seq       int64                  `json:"seq"`
	Type      string                 `json:"type"`
	Payload   map[string]interface{} `json:"payload"`
	CreatedAt time.Time              `json:"createdAt"`
}

type TaskEventsResponse struct {
	Events  []TaskEvent `json:"events"`
	NextSeq int64       `json:"nextSeq"`
}

type ResultArtifact struct {
	ID           string `json:"id"`
	Kind         string `json:"kind"`
	RelativePath string `json:"relativePath"`
	MimeType     string `json:"mimeType,omitempty"`
	Size         int64  `json:"size,omitempty"`
	SHA256       string `json:"sha256,omitempty"`
}

type ResultManifest struct {
	ProtocolVersion int                    `json:"protocolVersion"`
	ID              string                 `json:"id"`
	TaskID          string                 `json:"taskId"`
	JobID           string                 `json:"jobId"`
	StageRunID      string                 `json:"stageRunId"`
	Artifacts       []ResultArtifact       `json:"artifacts"`
	Metadata        map[string]interface{} `json:"metadata"`
	CreatedAt       time.Time              `json:"createdAt"`
}

type CapabilitiesResponse struct {
	ProtocolVersion int         `json:"protocolVersion"`
	ServiceVersion  string      `json:"serviceVersion"`
	Generation      int64       `json:"generation"`
	Stages          []StageType `json:"stages"`
}

type APIError struct {
	Error TaskError `json:"error"`
}

func allStages() []StageType {
	return []StageType{StageDownload, StageSubtitle, StageTTS, StageRenderHorizontal, StageRenderVertical}
}
