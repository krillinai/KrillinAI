package handler

import (
	"encoding/json"
	"krillin-ai/internal/dto"
	"krillin-ai/internal/service"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSubtitleHTTPProgressRequiresSuccessfulTask(t *testing.T) {
	for _, tc := range []struct {
		name    string
		status  uint8
		percent uint8
		want    uint8
		failed  bool
	}{
		{"processing", types.SubtitleTaskStatusProcessing, 54, 54, false},
		{"stage-complete", types.SubtitleTaskStatusProcessing, 100, 99, false},
		{"success", types.SubtitleTaskStatusSuccess, 95, 100, false},
		{"failed", types.SubtitleTaskStatusFailed, 100, 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			task := &types.SubtitleTask{TaskId: t.Name(), Status: tc.status, ProcessPct: tc.percent, FailReason: "翻译失败"}
			storage.SubtitleTasks.Store(task.TaskId, task)
			t.Cleanup(func() { storage.SubtitleTasks.Delete(task.TaskId) })
			h := &Handler{Service: &service.Service{}}
			router := gin.New()
			router.GET("/api/capability/subtitleTask", h.GetSubtitleTask)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/capability/subtitleTask?taskId="+task.TaskId, nil))
			var result dto.GetVideoSubtitleTaskRes
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if tc.failed {
				if result.Error == 0 || !strings.Contains(result.Msg, task.FailReason) {
					t.Fatalf("任务失败时应保留错误: %s", response.Body.String())
				}
				return
			}
			if response.Code != http.StatusOK || result.Error != 0 || result.Data == nil || result.Data.ProcessPercent != tc.want {
				t.Fatalf("任务状态应决定是否完成: %s", response.Body.String())
			}
		})
	}
}

func TestSubtitleHTTPReportsPartialTranslationAndClearsAfterRetry(t *testing.T) {
	task := &types.SubtitleTask{TaskId: t.Name(), Status: types.SubtitleTaskStatusSuccess}
	task.SetTranslationFailures("checkpoint", []types.SubtitleTranslationFailure{{SentenceID: "2", SourceText: "We meet today.", Reason: "初译请求耗尽"}})
	storage.SubtitleTasks.Store(task.TaskId, task)
	t.Cleanup(func() { storage.SubtitleTasks.Delete(task.TaskId) })
	h := &Handler{Service: &service.Service{}}
	router := gin.New()
	router.GET("/api/capability/subtitleTask", h.GetSubtitleTask)
	for _, failed := range []bool{true, false} {
		if !failed {
			task.SetTranslationFailures("checkpoint", nil)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/capability/subtitleTask?taskId="+task.TaskId, nil))
		var result dto.GetVideoSubtitleTaskRes
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Error != 0 || result.Data == nil || result.Data.ProcessPercent != 100 {
			t.Fatalf("部分完成应可下载：%s", response.Body.String())
		}
		if failed && (len(result.Data.TranslationFailures) != 1 || len(result.Data.Warnings) != 1 || result.Data.TranslationFailures[0].Reason == "") {
			t.Fatalf("失败句信息丢失：%s", response.Body.String())
		}
		if !failed && (len(result.Data.TranslationFailures) != 0 || len(result.Data.Warnings) != 0) {
			t.Fatal("恢复后仍显示旧警告")
		}
	}
}
