package whisperkit

import (
	"fmt"
	"testing"
)

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
