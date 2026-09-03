package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/internal/opencreatorapi"
	"krillin-ai/log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

var serviceVersion = "0.1.0"

func main() {
	log.InitLogger()
	defer log.GetLogger().Sync()

	listenAddress := os.Getenv("OPENCREATOR_KRILLIN_LISTEN")
	jobsRoot := os.Getenv("OPENCREATOR_KRILLIN_JOBS_ROOT")
	token := os.Getenv("OPENCREATOR_KRILLIN_TOKEN")
	if listenAddress != "127.0.0.1:0" {
		fatal(errors.New("OPENCREATOR_KRILLIN_LISTEN must be exactly 127.0.0.1:0"))
	}
	manager, err := opencreatorapi.NewManager(jobsRoot, nil)
	if err != nil {
		fatal(err)
	}
	defer manager.Close()
	generation := time.Now().UTC().UnixMilli()
	server, err := opencreatorapi.NewServer(opencreatorapi.ServerConfig{
		Token: token, ServiceVersion: serviceVersion, Generation: generation, Manager: manager,
	})
	if err != nil {
		fatal(err)
	}
	listener, err := net.Listen("tcp4", listenAddress)
	if err != nil {
		fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	startup, _ := json.Marshal(map[string]interface{}{"port": port, "generation": generation})
	fmt.Println(string(startup))

	httpServer := &http.Server{
		Handler: server.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, IdleTimeout: 30 * time.Second,
	}
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-interrupt
		_ = httpServer.Close()
	}()
	if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fatal(err)
	}
}

func fatal(err error) {
	_, _ = fmt.Fprintln(os.Stderr, "opencreator-server failed: "+err.Error())
	os.Exit(1)
}
