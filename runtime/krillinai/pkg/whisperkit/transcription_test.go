package whisperkit

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
)

func TestWhisperKitCommandArgumentsOmitAutoLanguage(t *testing.T) {
	args := whisperKitCommandArguments("audio.wav", "auto", t.TempDir(), false)
	if slices.Contains(args, "--language") || slices.Contains(args, "auto") {
		t.Fatalf("command args = %v, auto detection must omit --language", args)
	}

	explicitArgs := whisperKitCommandArguments("audio.wav", "en", t.TempDir(), false)
	languageIndex := slices.Index(explicitArgs, "--language")
	if languageIndex < 0 || languageIndex+1 >= len(explicitArgs) || explicitArgs[languageIndex+1] != "en" {
		t.Fatalf("command args = %v, want --language en", explicitArgs)
	}
}

func TestWhisperKitCommandErrorIncludesCapturedOutput(t *testing.T) {
	err := whisperKitCommandError(errors.New("exit status 64"), "Error: Invalid language code \"auto\"\n")
	if !strings.Contains(err.Error(), "exit status 64") || !strings.Contains(err.Error(), "Invalid language code") {
		t.Fatalf("error = %q, want exit status and command output", err)
	}
}

func TestProgressOutputReportsMonotonicFragmentedPercentages(t *testing.T) {
	var reported []int
	output := newProgressOutput(func(percent int) {
		reported = append(reported, percent)
	})

	chunks := []string{
		"\x1b[K[          ] 0% | Elapsed Time: 0.00 s\r",
		"\x1b[K[===       ] 3",
		"3% | Elapsed Time: 1.00 s\r",
		"\x1b[K[======    ] 66% | Elapsed Time: 2.00 s\r",
		"\x1b[K[===       ] 33% | repeated\r",
		"\x1b[K[==========] 100% | Elapsed Time: 3.00 s\n",
	}
	for _, chunk := range chunks {
		if _, err := output.Write([]byte(chunk)); err != nil {
			t.Fatal(err)
		}
	}

	if got := fmt.Sprint(reported); got != "[0 33 66 100]" {
		t.Fatalf("reported progress = %s", got)
	}
	if output.String() == "" {
		t.Fatal("captured output is empty")
	}
}
