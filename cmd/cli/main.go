package main

import (
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/cli"
	"krillin-ai/internal/deps"
	"krillin-ai/internal/pipeline"
	"krillin-ai/internal/service"
	"krillin-ai/log"
	"os"
	"strings"
)

func main() {
	log.InitLogger()
	defer log.GetLogger().Sync()

	cmd, err := cli.Parse(os.Args[1:])
	if err != nil {
		writeAndExit(errorResponse(err, pipeline.ErrorKindUsage))
	}
	if cmd.Help {
		fmt.Print(cli.Help(cmd))
		return
	}
	if cmd.Name == "voices" {
		if cmd.Voices.Provider == "" {
			_ = config.LoadConfig()
		}
		writeAndExit(cli.Execute(context.Background(), nil, cmd))
		return
	}
	if cmd.DryRun {
		writeAndExit(cli.Execute(context.Background(), nil, cmd))
		return
	}
	if cmd.Name == "update" {
		writeAndExit(cli.Execute(context.Background(), nil, cmd))
		return
	}

	if !config.LoadConfig() {
		writeAndExit(pipeline.Response{
			OK: false,
			Error: &pipeline.Error{
				Kind:    pipeline.ErrorKindUsage,
				Code:    "config_not_found",
				Message: "未找到配置文件",
			},
		})
	}
	if err := config.CheckBaseConfig(); err != nil {
		writeAndExit(errorResponse(err, pipeline.ErrorKindUsage))
	}
	if requiresTranscriptionAtStart(cmd) {
		if err := config.ValidateTranscriptionConfig(); err != nil {
			writeAndExit(errorResponse(err, pipeline.ErrorKindUsage))
		}
	}
	if err := deps.CheckCoreDependencies(); err != nil {
		writeAndExit(errorResponse(err, pipeline.ErrorKindDependency))
	}
	if requiresTranscriptionAtStart(cmd) {
		if err := deps.CheckTranscriptionDependency(); err != nil {
			writeAndExit(errorResponse(err, pipeline.ErrorKindDependency))
		}
	}
	if cmd.Name == "tts" {
		if err := deps.CheckTTSDependency(); err != nil {
			writeAndExit(errorResponse(err, pipeline.ErrorKindDependency))
		}
	}
	svc := service.NewService()
	adapter := pipeline.NewServiceAdapter(svc)
	writeAndExit(cli.Execute(context.Background(), adapter, cmd))
}

func requiresTranscriptionAtStart(cmd cli.Command) bool {
	if cmd.Name != "subtitle" {
		return false
	}
	if cmd.Subtitle.CaptionSource == pipeline.CaptionSourceWhisper {
		return true
	}
	input := strings.ToLower(strings.TrimSpace(cmd.Subtitle.Input))
	return !strings.Contains(input, "youtube.com") && !strings.Contains(input, "youtu.be")
}

func errorResponse(err error, kind pipeline.ErrorKind) pipeline.Response {
	return pipeline.Response{
		OK: false,
		Error: &pipeline.Error{
			Kind:      kind,
			Code:      string(kind),
			Message:   err.Error(),
			Retryable: kind == pipeline.ErrorKindRetryable,
		},
	}
}

func writeAndExit(resp pipeline.Response) {
	data, err := json.Marshal(resp)
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, `{"ok":false,"error":{"kind":"internal","code":"json_marshal_failed","message":%q}}`+"\n", err.Error())
		os.Exit(1)
	}
	fmt.Println(string(data))
	if !resp.OK {
		os.Exit(pipeline.ExitCodeForError(resp.Error))
	}
}
