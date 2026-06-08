package pipeline

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"krillin-ai/pkg/image"
	"net/http"
	"os"
	"strings"
)

const defaultCoverSize = "1024x1024"

type CoverRequest struct {
	Workdir string
	TaskID  string
	Prompt  string
	Size    string
}

type CoverPromptData struct {
	Title          string
	Description    string
	OriginLanguage string
	TargetLanguage string
	StyleHint      string
}

func RenderCoverPrompt(tmpl string, data CoverPromptData) string {
	replacer := strings.NewReplacer(
		"{{title}}", data.Title,
		"{{description}}", data.Description,
		"{{origin_language}}", data.OriginLanguage,
		"{{target_language}}", data.TargetLanguage,
		"{{style_hint}}", data.StyleHint,
	)
	return replacer.Replace(tmpl)
}

func GenerateCover(ctx context.Context, svc StageService, req CoverRequest) (Response, error) {
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" {
		err := errors.New("cover prompt is required")
		return coverFailureResponse(req, nil, ErrorKindUsage, "prompt_required", err), err
	}
	if req.Size == "" {
		req.Size = defaultCoverSize
	}

	manifest, err := coverManifest(req)
	if err != nil {
		return coverFailureResponse(req, nil, ErrorKindInternal, "load_manifest_failed", err), err
	}
	manifest.TaskID = req.TaskID
	manifest.Workdir = req.Workdir
	existingOutputs := manifest.Outputs
	if err := manifest.ApplyDefaultOutputs(); err != nil {
		return coverFailureResponse(req, manifest, ErrorKindInternal, "apply_outputs_failed", err), err
	}
	restoreOutputs(manifest, existingOutputs)

	result, err := svc.GenerateCoverImage(ctx, image.GenerateRequest{
		Prompt: req.Prompt,
		Size:   req.Size,
	})
	if err != nil {
		return failCoverStage(req, manifest, "generate_cover_failed", err)
	}
	imageBytes, err := coverImageBytes(ctx, result)
	if err != nil {
		return failCoverStage(req, manifest, "decode_cover_failed", err)
	}
	if err := os.WriteFile(manifest.Outputs.FinalCoverPrompt, []byte(req.Prompt), 0644); err != nil {
		return coverFailureResponse(req, manifest, ErrorKindInternal, "write_prompt_failed", err), err
	}
	if err := os.WriteFile(manifest.Outputs.GeneratedCover, imageBytes, 0644); err != nil {
		return coverFailureResponse(req, manifest, ErrorKindInternal, "write_cover_failed", err), err
	}

	manifest.MarkStage(StageCover, true, "")
	if err := manifest.Save(); err != nil {
		return coverFailureResponse(req, manifest, ErrorKindInternal, "save_manifest_failed", err), err
	}
	return coverResponse(true, req, manifest, nil), nil
}

func coverImageBytes(ctx context.Context, result image.GenerateResult) ([]byte, error) {
	if result.B64JSON != "" {
		return base64.StdEncoding.DecodeString(result.B64JSON)
	}
	if result.URL == "" {
		return nil, fmt.Errorf("cover generation response missing image data")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, result.URL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("download generated cover failed: status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func coverManifest(req CoverRequest) (*Manifest, error) {
	if req.Workdir == "" {
		return nil, fmt.Errorf("cover requires --workdir")
	}
	manifest, err := LoadManifest(req.Workdir)
	if err == nil {
		return manifest, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return NewManifest(req.TaskID, req.Workdir), nil
	}
	return nil, err
}

func failCoverStage(req CoverRequest, manifest *Manifest, code string, err error) (Response, error) {
	if manifest != nil {
		manifest.MarkStage(StageCover, false, err.Error())
		_ = manifest.Save()
	}
	return coverFailureResponse(req, manifest, ErrorKindRetryable, code, err), err
}

func coverFailureResponse(req CoverRequest, manifest *Manifest, kind ErrorKind, code string, err error) Response {
	return coverResponse(false, req, manifest, &Error{
		Kind:      kind,
		Code:      code,
		Message:   err.Error(),
		Retryable: kind == ErrorKindRetryable,
	})
}

func coverResponse(ok bool, req CoverRequest, manifest *Manifest, pipelineErr *Error) Response {
	resp := Response{
		OK:      ok,
		Stage:   StageCover,
		Workdir: req.Workdir,
		TaskID:  req.TaskID,
		Error:   pipelineErr,
	}
	if manifest != nil {
		resp.Workdir = manifest.Workdir
		resp.TaskID = manifest.TaskID
		resp.Outputs = manifest.Outputs
		resp.Warnings = manifest.Warnings
		resp.FailedIndexes = manifest.FailedIndexes
	}
	return resp
}
