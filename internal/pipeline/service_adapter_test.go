package pipeline

import (
	"krillin-ai/internal/service"
	"testing"
)

func TestNewServiceAdapterKeepsService(t *testing.T) {
	svc := &service.Service{}
	adapter := NewServiceAdapter(svc)
	if adapter == nil {
		t.Fatalf("NewServiceAdapter() returned nil")
	}
}
