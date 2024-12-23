package handler

import "krillin-ai/internal/service"

type Handler struct {
	Service *service.Service
}

func NewHandler() *Handler {
	return &Handler{
		Service: service.NewService(),
	}
}
