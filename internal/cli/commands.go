package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"krillin-ai/internal/pipeline"
	subtitlestyle "krillin-ai/internal/subtitle_style"
	"os"
	"strings"
)

const defaultSubtitleStylePath = "config/subtitle-style-default.json"

type Command struct {
	Name     string
	Help     bool
	DryRun   bool
	Subtitle pipeline.SubtitleRequest
	TTS      pipeline.TTSRequest
	Render   pipeline.RenderRequest
	Cover    pipeline.CoverRequest
	Pipeline pipeline.PipelineRequest
}

func Parse(args []string) (Command, error) {
	if len(args) == 0 {
		return Command{}, errors.New("missing command")
	}
	name := args[0]
	if isHelpArg(name) {
		return Command{Help: true}, nil
	}
	switch name {
	case "subtitle":
		return parseSubtitle(name, args[1:])
	case "tts":
		return parseTTS(name, args[1:])
	case "render-horizontal":
		return parseRender(name, args[1:], true)
	case "render-vertical":
		return parseRender(name, args[1:], false)
	case "pipeline":
		return parsePipeline(name, args[1:])
	case "cover":
		return parseCover(name, args[1:])
	case "status":
		if hasHelpArg(args[1:]) {
			return Command{Name: name, Help: true}, nil
		}
		return Command{Name: name}, nil
	default:
		return Command{}, fmt.Errorf("unknown command: %s", name)
	}
}

func Help(cmd Command) string {
	switch cmd.Name {
	case "subtitle":
		return `Usage:
  krillinai-cli subtitle <input> --origin-lang <lang> --target-lang <lang> --workdir <dir> [flags]

Flags:
  --origin-lang <lang>       Source language, such as en, zh, ja
  --target-lang <lang>       Target language, such as zh_cn
  --user-lang <lang>         UI language for generated messages
  --workdir <dir>            Task working directory
  --task-id <id>             Optional task id
  --caption-source <source>  any, manual, auto, or whisper
  --bilingual-top            Put target subtitle on top (default true)
  --max-word-one-line <n>    Max words per subtitle line
  --subtitle-style-file <file>  JSON subtitle style override file
  --dry-run                  Validate command without external calls
  -h, --help                 Show this help
`
	case "tts":
		return `Usage:
  krillinai-cli tts --workdir <dir> --input-srt <file> [flags]

Flags:
  --workdir <dir>                 Task working directory
  --task-id <id>                  Optional task id
  --input-srt <file>              SRT file to synthesize
  --line-mode <mode>              target-only, bilingual-target-top, or bilingual-target-bottom
  --video <file>                  Optional source video for dubbed output
  --voice <voice>                 Provider-specific voice
  --voice-clone-source <source>   Optional voice clone source
  --dry-run                       Validate command without external calls
  -h, --help                      Show this help
`
	case "render-horizontal":
		return `Usage:
  krillinai-cli render-horizontal --workdir <dir> --video <file> --subtitle <file> [flags]

Flags:
  --workdir <dir>       Task working directory
  --task-id <id>        Optional task id
  --video <file>        Input video
  --audio <file>        Optional input audio
  --subtitle <file>     Subtitle file to burn in
  --subtitle-style-file <file>  JSON subtitle style override file
  --dubbed              Render dubbed variant
  --dry-run             Validate command without external calls
  -h, --help            Show this help
`
	case "render-vertical":
		return `Usage:
  krillinai-cli render-vertical --workdir <dir> --video <file> --subtitle <file> [flags]

Flags:
  --workdir <dir>       Task working directory
  --task-id <id>        Optional task id
  --video <file>        Input video
  --audio <file>        Optional input audio
  --subtitle <file>     Subtitle file to burn in
  --subtitle-style-file <file>  JSON subtitle style override file
  --dubbed              Render dubbed variant
  --major-title <text>  Vertical video major title
  --minor-title <text>  Vertical video minor title
  --dry-run             Validate command without external calls
  -h, --help            Show this help
`
	case "pipeline":
		return `Usage:
  krillinai-cli pipeline --outputs <list> [flags]

Flags:
  --outputs <list>  Comma-separated outputs, such as subtitle,tts,vertical-bilingual
  --async           Run asynchronously when supported
  --dry-run         Validate requested outputs
  -h, --help        Show this help
`
	case "cover":
		return `Usage:
  krillinai-cli cover --workdir <dir> --prompt <text> [flags]

Flags:
  --workdir <dir>   Task working directory
  --task-id <id>    Optional task id
  --prompt <text>   Prompt for GPT image cover generation
  --size <size>     Image size, such as 1024x1024 or 1536x1024
  --dry-run         Validate command without external calls
  -h, --help        Show this help
`
	case "status":
		return `Usage:
  krillinai-cli status

Status query is a reserved/planned CLI surface in the current implementation.
`
	default:
		return `Usage:
  krillinai-cli <command> [flags]

Commands:
  subtitle             Generate source, target, bilingual, and short vertical subtitles
  tts                  Generate target-language dubbing from SRT subtitles
  render-horizontal    Render landscape subtitle or dubbed videos
  render-vertical      Render portrait subtitle or dubbed videos
  pipeline             Plan or run multi-stage workflows when supported
  cover                Generate a cover image from a prompt
  status               Reserved status query surface

Run "krillinai-cli <command> --help" for command-specific flags.
`
	}
}

func Execute(ctx context.Context, svc pipeline.StageService, cmd Command) pipeline.Response {
	if cmd.DryRun {
		return dryRun(cmd)
	}
	switch cmd.Name {
	case "subtitle":
		style, err := loadSubtitleStyleForCLI(cmd.Subtitle.SubtitleStyleFile)
		if err != nil {
			return styleLoadFailure(pipeline.StageSubtitle, cmd.Subtitle.Workdir, cmd.Subtitle.TaskID, err)
		}
		cmd.Subtitle.SubtitleStyle = style
		resp, err := pipeline.GenerateSubtitles(ctx, svc, cmd.Subtitle)
		return responseWithError(resp, err)
	case "tts":
		resp, err := pipeline.GenerateTTS(ctx, svc, cmd.TTS)
		return responseWithError(resp, err)
	case "render-horizontal", "render-vertical":
		style, err := loadSubtitleStyleForCLI(cmd.Render.SubtitleStyleFile)
		if err != nil {
			return styleLoadFailure(renderStageFromCommand(cmd.Name), cmd.Render.Workdir, cmd.Render.TaskID, err)
		}
		cmd.Render.SubtitleStyle = style
		resp, err := pipeline.Render(ctx, svc, cmd.Render)
		return responseWithError(resp, err)
	case "cover":
		resp, err := pipeline.GenerateCover(ctx, svc, cmd.Cover)
		return responseWithError(resp, err)
	default:
		return pipeline.Response{
			OK: false,
			Error: &pipeline.Error{
				Kind:    pipeline.ErrorKindUsage,
				Code:    "unsupported_command",
				Message: fmt.Sprintf("unsupported command: %s", cmd.Name),
			},
		}
	}
}

func parseCover(name string, args []string) (Command, error) {
	if hasHelpArg(args) {
		return Command{Name: name, Help: true}, nil
	}
	fs := newFlagSet(name)
	workdir := fs.String("workdir", "", "workdir")
	taskID := fs.String("task-id", "", "task id")
	prompt := fs.String("prompt", "", "image prompt")
	size := fs.String("size", "", "image size")
	dryRun := fs.Bool("dry-run", false, "validate command without running external services")
	if err := fs.Parse(args); err != nil {
		return Command{}, err
	}
	if strings.TrimSpace(*prompt) == "" {
		return Command{}, errors.New("cover requires --prompt")
	}
	return Command{
		Name:   name,
		DryRun: *dryRun,
		Cover: pipeline.CoverRequest{
			Workdir: *workdir,
			TaskID:  *taskID,
			Prompt:  *prompt,
			Size:    *size,
		},
	}, nil
}

func parseSubtitle(name string, args []string) (Command, error) {
	if hasHelpArg(args) {
		return Command{Name: name, Help: true}, nil
	}
	fs := newFlagSet(name)
	originLang := fs.String("origin-lang", "", "origin language")
	targetLang := fs.String("target-lang", "", "target language")
	userLang := fs.String("user-lang", "", "user interface language")
	workdir := fs.String("workdir", "", "workdir")
	taskID := fs.String("task-id", "", "task id")
	captionSource := fs.String("caption-source", string(pipeline.CaptionSourceAny), "caption source")
	bilingualTop := fs.Bool("bilingual-top", true, "put target subtitle on top")
	maxWordOneLine := fs.Int("max-word-one-line", 0, "max words per line")
	subtitleStyleFile := fs.String("subtitle-style-file", "", "subtitle style JSON file")
	dryRun := fs.Bool("dry-run", false, "validate command without running external services")
	input := ""
	parseArgs := args
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		input = args[0]
		parseArgs = args[1:]
	}
	if err := fs.Parse(parseArgs); err != nil {
		return Command{}, err
	}
	if input == "" && fs.NArg() == 1 {
		input = fs.Arg(0)
	}
	if input == "" || fs.NArg() > 1 {
		return Command{}, errors.New("subtitle requires input")
	}
	return Command{
		Name:   name,
		DryRun: *dryRun,
		Subtitle: pipeline.SubtitleRequest{
			Input:             input,
			Workdir:           *workdir,
			TaskID:            *taskID,
			OriginLang:        *originLang,
			TargetLang:        *targetLang,
			UserLang:          *userLang,
			CaptionSource:     pipeline.CaptionSource(*captionSource),
			BilingualTop:      *bilingualTop,
			MaxWordOneLine:    *maxWordOneLine,
			SubtitleStyleFile: *subtitleStyleFile,
		},
	}, nil
}

func parseTTS(name string, args []string) (Command, error) {
	if hasHelpArg(args) {
		return Command{Name: name, Help: true}, nil
	}
	fs := newFlagSet(name)
	workdir := fs.String("workdir", "", "workdir")
	taskID := fs.String("task-id", "", "task id")
	inputSRT := fs.String("input-srt", "", "input srt")
	lineMode := fs.String("line-mode", string(pipeline.LineModeTargetOnly), "line mode")
	video := fs.String("video", "", "input video")
	voice := fs.String("voice", "", "voice")
	voiceCloneSource := fs.String("voice-clone-source", "", "voice clone source")
	dryRun := fs.Bool("dry-run", false, "validate command without running external services")
	if err := fs.Parse(args); err != nil {
		return Command{}, err
	}
	if *inputSRT == "" {
		return Command{}, errors.New("tts requires --input-srt")
	}
	return Command{
		Name:   name,
		DryRun: *dryRun,
		TTS: pipeline.TTSRequest{
			Workdir:          *workdir,
			TaskID:           *taskID,
			InputSRT:         *inputSRT,
			LineMode:         pipeline.LineMode(*lineMode),
			Video:            *video,
			Voice:            *voice,
			VoiceCloneSource: *voiceCloneSource,
		},
	}, nil
}

func parseRender(name string, args []string, horizontal bool) (Command, error) {
	if hasHelpArg(args) {
		return Command{Name: name, Help: true}, nil
	}
	fs := newFlagSet(name)
	workdir := fs.String("workdir", "", "workdir")
	taskID := fs.String("task-id", "", "task id")
	video := fs.String("video", "", "input video")
	audio := fs.String("audio", "", "input audio")
	subtitle := fs.String("subtitle", "", "subtitle")
	dubbed := fs.Bool("dubbed", false, "render dubbed video")
	majorTitle := fs.String("major-title", "", "vertical major title")
	minorTitle := fs.String("minor-title", "", "vertical minor title")
	subtitleStyleFile := fs.String("subtitle-style-file", "", "subtitle style JSON file")
	dryRun := fs.Bool("dry-run", false, "validate command without running external services")
	if err := fs.Parse(args); err != nil {
		return Command{}, err
	}
	return Command{
		Name:   name,
		DryRun: *dryRun,
		Render: pipeline.RenderRequest{
			Workdir:           *workdir,
			TaskID:            *taskID,
			Video:             *video,
			Audio:             *audio,
			Subtitle:          *subtitle,
			Horizontal:        horizontal,
			Dubbed:            *dubbed,
			MajorTitle:        *majorTitle,
			MinorTitle:        *minorTitle,
			SubtitleStyleFile: *subtitleStyleFile,
		},
	}, nil
}

func parsePipeline(name string, args []string) (Command, error) {
	if hasHelpArg(args) {
		return Command{Name: name, Help: true}, nil
	}
	fs := newFlagSet(name)
	outputs := fs.String("outputs", "subtitle", "outputs")
	async := fs.Bool("async", false, "run async")
	dryRun := fs.Bool("dry-run", false, "validate command without running external services")
	if err := fs.Parse(args); err != nil {
		return Command{}, err
	}
	if _, err := pipeline.PlanOutputs(*outputs); err != nil {
		return Command{}, err
	}
	return Command{
		Name:   name,
		DryRun: *dryRun,
		Pipeline: pipeline.PipelineRequest{
			Outputs: *outputs,
			Async:   *async,
		},
	}, nil
}

func dryRun(cmd Command) pipeline.Response {
	switch cmd.Name {
	case "subtitle":
		if _, err := loadSubtitleStyleForCLI(cmd.Subtitle.SubtitleStyleFile); err != nil {
			return styleLoadFailure(pipeline.StageSubtitle, cmd.Subtitle.Workdir, cmd.Subtitle.TaskID, err)
		}
		return dryRunResponse(pipeline.StageSubtitle, cmd.Subtitle.Workdir, cmd.Subtitle.TaskID)
	case "tts":
		return dryRunManifest(cmd.TTS.Workdir, cmd.TTS.TaskID, pipeline.StageTTS, nil)
	case "render-horizontal":
		if _, err := loadSubtitleStyleForCLI(cmd.Render.SubtitleStyleFile); err != nil {
			return styleLoadFailure(pipeline.StageRenderHorizontal, cmd.Render.Workdir, cmd.Render.TaskID, err)
		}
		return dryRunResponse(pipeline.StageRenderHorizontal, cmd.Render.Workdir, cmd.Render.TaskID)
	case "render-vertical":
		if _, err := loadSubtitleStyleForCLI(cmd.Render.SubtitleStyleFile); err != nil {
			return styleLoadFailure(pipeline.StageRenderVertical, cmd.Render.Workdir, cmd.Render.TaskID, err)
		}
		return dryRunResponse(pipeline.StageRenderVertical, cmd.Render.Workdir, cmd.Render.TaskID)
	case "cover":
		return dryRunManifest(cmd.Cover.Workdir, cmd.Cover.TaskID, pipeline.StageCover, func(m *pipeline.Manifest) {
			m.Outputs.FinalCoverPrompt = m.Outputs.FinalCoverPrompt
		})
	case "pipeline":
		return pipeline.Response{OK: true, Stage: pipeline.StagePipeline}
	default:
		return pipeline.Response{
			OK: false,
			Error: &pipeline.Error{
				Kind:    pipeline.ErrorKindUsage,
				Code:    "unsupported_dry_run",
				Message: fmt.Sprintf("unsupported dry-run command: %s", cmd.Name),
			},
		}
	}
}

func dryRunResponse(stage pipeline.Stage, workdir, taskID string) pipeline.Response {
	return pipeline.Response{
		OK:      true,
		Stage:   stage,
		Workdir: workdir,
		TaskID:  taskID,
	}
}

func dryRunManifest(workdir, taskID string, stage pipeline.Stage, update func(*pipeline.Manifest)) pipeline.Response {
	if workdir == "" {
		workdir = "."
	}
	manifest := pipeline.NewManifest(taskID, workdir)
	if update != nil {
		update(manifest)
	}
	if err := manifest.ApplyDefaultOutputs(); err != nil {
		return dryRunError(stage, workdir, taskID, "apply_outputs_failed", err)
	}
	manifest.MarkStage(stage, true, "dry-run")
	if err := manifest.Save(); err != nil && !errors.Is(err, os.ErrExist) {
		return dryRunError(stage, workdir, taskID, "save_manifest_failed", err)
	}
	return pipeline.Response{
		OK:      true,
		Stage:   stage,
		Workdir: manifest.Workdir,
		TaskID:  manifest.TaskID,
		Outputs: manifest.Outputs,
	}
}

func dryRunError(stage pipeline.Stage, workdir, taskID, code string, err error) pipeline.Response {
	return pipeline.Response{
		OK:      false,
		Stage:   stage,
		Workdir: workdir,
		TaskID:  taskID,
		Error: &pipeline.Error{
			Kind:    pipeline.ErrorKindInternal,
			Code:    code,
			Message: err.Error(),
		},
	}
}

func loadSubtitleStyleForCLI(styleFile string) (*subtitlestyle.StyleSet, error) {
	base := subtitlestyle.DefaultStyleSet()
	if _, err := os.Stat(defaultSubtitleStylePath); err == nil {
		fileStyle, err := subtitlestyle.LoadOverrideFile(defaultSubtitleStylePath)
		if err != nil {
			return nil, err
		}
		base, err = subtitlestyle.Merge(base, fileStyle)
		if err != nil {
			return nil, err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if strings.TrimSpace(styleFile) == "" {
		return base, nil
	}
	override, err := subtitlestyle.LoadOverrideFile(styleFile)
	if err != nil {
		return nil, err
	}
	return subtitlestyle.Merge(base, override)
}

func styleLoadFailure(stage pipeline.Stage, workdir, taskID string, err error) pipeline.Response {
	return pipeline.Response{
		OK:      false,
		Stage:   stage,
		Workdir: workdir,
		TaskID:  taskID,
		Error: &pipeline.Error{
			Kind:    pipeline.ErrorKindUsage,
			Code:    "subtitle_style_load_failed",
			Message: err.Error(),
		},
	}
}

func renderStageFromCommand(name string) pipeline.Stage {
	if name == "render-horizontal" {
		return pipeline.StageRenderHorizontal
	}
	return pipeline.StageRenderVertical
}

func newFlagSet(name string) *flag.FlagSet {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	return fs
}

func hasHelpArg(args []string) bool {
	for _, arg := range args {
		if isHelpArg(arg) {
			return true
		}
	}
	return false
}

func isHelpArg(arg string) bool {
	return arg == "-h" || arg == "--help" || arg == "help"
}

func responseWithError(resp pipeline.Response, err error) pipeline.Response {
	if err == nil {
		return resp
	}
	if resp.Error != nil {
		return resp
	}
	resp.OK = false
	resp.Error = &pipeline.Error{
		Kind:      pipeline.ErrorKindRetryable,
		Code:      "command_failed",
		Message:   err.Error(),
		Retryable: true,
	}
	return resp
}
