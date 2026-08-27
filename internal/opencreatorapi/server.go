package opencreatorapi

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
)

type ServerConfig struct {
	Token          string
	ServiceVersion string
	Generation     int64
	Manager        *Manager
}

type Server struct {
	token          string
	serviceVersion string
	generation     int64
	manager        *Manager
	handler        http.Handler
}

func NewServer(config ServerConfig) (*Server, error) {
	if len(config.Token) < 32 {
		return nil, errors.New("service token must contain at least 256 bits")
	}
	if config.Manager == nil {
		return nil, errors.New("manager is required")
	}
	server := &Server{
		token: config.Token, serviceVersion: config.ServiceVersion, generation: config.Generation, manager: config.Manager,
	}
	server.handler = server.authenticate(http.HandlerFunc(server.route))
	return server, nil
}

func (s *Server) Handler() http.Handler {
	return s.handler
}

func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provided := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if len(provided) != len(s.token) || subtle.ConstantTimeCompare([]byte(provided), []byte(s.token)) != 1 {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Bearer token is invalid")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) route(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimSuffix(r.URL.Path, "/")
	if path == "/v1/health" && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "generation": s.generation})
		return
	}
	if path == "/v1/capabilities" && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, CapabilitiesResponse{
			ProtocolVersion: ProtocolVersion, ServiceVersion: s.serviceVersion, Generation: s.generation, Stages: allStages(),
		})
		return
	}
	if path == "/v1/tasks" && r.Method == http.MethodPost {
		s.createTask(w, r)
		return
	}
	parts := strings.Split(strings.TrimPrefix(path, "/v1/tasks/"), "/")
	if !strings.HasPrefix(path, "/v1/tasks/") || len(parts) == 0 || validateIdentifier(parts[0]) != nil {
		writeError(w, http.StatusNotFound, "route_not_found", "Route not found")
		return
	}
	taskID := parts[0]
	if len(parts) == 1 && r.Method == http.MethodGet {
		task, err := s.manager.Get(taskID)
		writeTaskResult(w, task, err)
		return
	}
	if len(parts) == 2 && parts[1] == "cancel" && r.Method == http.MethodPost {
		task, err := s.manager.Cancel(taskID)
		writeTaskResult(w, task, err)
		return
	}
	if len(parts) == 2 && parts[1] == "events" && r.Method == http.MethodGet {
		afterSeq, err := strconv.ParseInt(defaultString(r.URL.Query().Get("afterSeq"), "0"), 10, 64)
		if err != nil || afterSeq < 0 {
			writeError(w, http.StatusBadRequest, "invalid_event_cursor", "afterSeq must be a non-negative integer")
			return
		}
		response, err := s.manager.Events(taskID, afterSeq)
		if err != nil {
			writeManagerError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
		return
	}
	if len(parts) == 2 && parts[1] == "result" && r.Method == http.MethodGet {
		manifest, err := s.manager.Result(taskID)
		if err != nil {
			writeManagerError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, manifest)
		return
	}
	writeError(w, http.StatusNotFound, "route_not_found", "Route not found")
}

func (s *Server) createTask(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, 2<<20))
	decoder.DisallowUnknownFields()
	var req CreateTaskRequest
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Request body does not match Protocol V1")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid_request", "Request body must contain one JSON object")
		return
	}
	task, replay, err := s.manager.Create(req)
	if err != nil {
		writeManagerError(w, err)
		return
	}
	status := http.StatusAccepted
	if replay {
		status = http.StatusOK
	}
	writeJSON(w, status, task)
}

func writeTaskResult(w http.ResponseWriter, task Task, err error) {
	if err != nil {
		writeManagerError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func writeManagerError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrTaskNotFound) {
		writeError(w, http.StatusNotFound, "task_not_found", "Task was not found")
		return
	}
	if errors.Is(err, ErrIdempotencyKeyReuse) {
		writeError(w, http.StatusConflict, "idempotency_key_reused", "Idempotency key was reused with a different request hash")
		return
	}
	var runErr *RunError
	if errors.As(err, &runErr) {
		writeError(w, http.StatusBadRequest, runErr.Code, runErr.Message)
		return
	}
	if err.Error() == "result_not_ready" {
		writeError(w, http.StatusConflict, "result_not_ready", "Task result is not ready")
		return
	}
	writeError(w, http.StatusInternalServerError, "internal_error", "KrillinAI service request failed")
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, APIError{Error: TaskError{Code: code, Message: message, Retryable: status >= 500}})
}

func writeJSON(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
