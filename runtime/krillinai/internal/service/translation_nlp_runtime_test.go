package service

import (
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"reflect"
	"sync"
	"testing"
	"time"
)

func TestNLPRuntimeReusesProcessAndRestartsAfterCancellation(t *testing.T) {
	python, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("Python not installed")
	}
	t.Setenv("KRILLINAI_NLP_PYTHON", python)
	r := newTranslationNLPRuntime(context.Background())
	defer r.close()
	r.worker = "import sys,json,os,time\nfor line in sys.stdin:\n r=json.loads(line)\n if r.get('hang'):time.sleep(30)\n if r.get('exit'):sys.exit(2)\n print(json.dumps(dict(r,pid=os.getpid())),flush=True)\n"
	call := func(ctx context.Context, data string) (map[string]any, error) {
		raw, err := r.exchange(ctx, []byte(data))
		var out map[string]any
		if err == nil {
			err = json.Unmarshal(raw, &out)
		}
		return out, err
	}
	first, err := call(context.Background(), `{"id":0}`)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			out, err := call(context.Background(), `{"id":1}`)
			if err != nil || out["pid"] != first["pid"] {
				t.Error("process reused incorrectly", out, err)
			}
		}()
	}
	wg.Wait()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := call(ctx, `{"hang":true}`); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("cancelled worker did not stop", err)
	}
	next, err := call(context.Background(), `{"id":2}`)
	if err != nil || next["pid"] == first["pid"] {
		t.Fatal("failed worker not restarted", next, err)
	}
	if _, err := call(context.Background(), `{"exit":true}`); err == nil {
		t.Fatal("worker crash ignored")
	}
	if _, err := call(context.Background(), `{"id":3}`); err != nil {
		t.Fatal("crashed worker not restarted", err)
	}
}

func TestNLPRuntimeMatchesOneShotParser(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	texts := []string{"that a teenager on their first week of work could produce a consistent product,", "Every process, every step, every rule, every temperature, every timing, every procedure,"}
	want, err := runTranslationNLP(ctx, texts, "en")
	if err != nil || want.Unavailable != "" {
		t.Skip("English parser unavailable")
	}
	r := newTranslationNLPRuntime(ctx)
	defer r.close()
	got, err := r.segment(ctx, texts, "en")
	if err != nil || !reflect.DeepEqual(want, got) {
		t.Fatal("warm parser changed hints", want, got, err)
	}
	work := []segmentOverflow{{ID: "1", Source: texts[0], MinPieces: 2}, {ID: "2", Source: texts[1], MinPieces: 2}}
	input := pairedTranslationInput{MaxTargetChars: 75}
	a, err := chooseParsedSegmentCutOptions(ctx, input, work, "en")
	if err != nil {
		t.Fatal(err)
	}
	b, err := chooseParsedSegmentCutOptions(ctx, input, work, "en", r)
	if err != nil || !reflect.DeepEqual(a, b) {
		t.Fatal("warm parser changed cut options", a, b, err)
	}
	checks := []translationNLPBoundaryRequest{{Source: texts[0], Parts: []string{"that a teenager on their first week of work", "could produce a consistent product,"}}}
	x, err := runTranslationNLPBoundaryCheck(ctx, checks, "en")
	if err != nil {
		t.Fatal(err)
	}
	y, err := r.boundaries(ctx, checks, "en")
	if err != nil || !reflect.DeepEqual(x, y) {
		t.Fatal("warm parser changed boundary protection", x, y, err)
	}
}
