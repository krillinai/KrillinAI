package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"krillin-ai/pkg/whisper"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	if len(os.Args) != 3 {
		panic("Supply a real ASR report.json and its reference WAV")
	}
	data, err := os.ReadFile(os.Args[1])
	must(err)
	var report struct {
		Language string `json:"language"`
		Results  []struct {
			Model            string `json:"model"`
			Modality         string `json:"modality"`
			Status           string `json:"status"`
			UpstreamMetadata struct {
				HTTPStatus int `json:"httpStatus"`
			} `json:"upstreamMetadata"`
		} `json:"results"`
	}
	must(json.Unmarshal(data, &report))
	if report.Language == "" {
		report.Language = "en"
	}
	checked := 0
	for _, result := range report.Results {
		if result.Modality != "transcription" || (result.Status != "passed" && result.UpstreamMetadata.HTTPStatus != 200) {
			continue
		}
		root := filepath.Join(filepath.Dir(os.Args[1]), strings.ReplaceAll(result.Model, "/", "__"), "receipts")
		files, err := os.ReadDir(root)
		must(err)
		if len(files) != 1 {
			panic("Expected one real provider receipt")
		}
		data, err = os.ReadFile(filepath.Join(root, files[0].Name()))
		must(err)
		var receipt struct {
			State   string `json:"state"`
			Content string `json:"content"`
		}
		must(json.Unmarshal(data, &receipt))
		if receipt.State != "succeeded" {
			panic("Receipt is not a completed real transcription")
		}
		payload, err := base64.StdEncoding.DecodeString(receipt.Content)
		must(err)
		requests := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requests++
			must(r.ParseMultipartForm(1 << 20))
			if r.FormValue("model") != result.Model || r.FormValue("response_format") != "verbose_json" || r.FormValue("timestamp_granularities[]") != "segment" {
				panic("Unexpected production ASR request parameters")
			}
			w.Header().Set("Content-Type", "application/json")
			_, err := w.Write(payload)
			must(err)
		}))
		client := whisper.NewOfficialClient(server.URL, "local-replay-only", "", result.Model)
		transcription, err := client.Transcription(os.Args[2], report.Language, filepath.Dir(os.Args[2]))
		server.Close()
		must(err)
		if requests != 1 || strings.TrimSpace(transcription.Text) == "" || len(transcription.Words) == 0 {
			panic("Real response cannot be consumed as subtitles")
		}
		for _, word := range transcription.Words {
			if word.Start < 0 || word.End <= word.Start || strings.TrimSpace(word.Text) == "" {
				panic("Invalid parsed subtitle timing")
			}
		}
		checked++
		output, err := json.Marshal(map[string]any{"model": result.Model, "subtitleEntries": len(transcription.Words), "text": transcription.Text, "paidSubmissions": 0})
		must(err)
		fmt.Println(string(output))
	}
	if checked == 0 {
		panic("No passed real ASR responses in the report")
	}
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
