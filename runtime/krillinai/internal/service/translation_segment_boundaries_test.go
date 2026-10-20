package service

import (
	"reflect"
	"strings"
	"testing"
)

func TestSegmentedParsedOptionsKeepValidCandidates(t *testing.T) {
	source := "that a teenager on their first week of work could produce a consistent product,"
	valid := []string{"that a teenager on their first week of work could produce", "a consistent product,"}
	punctuationOnly := []string{valid[0], "a consistent product", ","}
	other := []string{"Every process, every step, every rule,", "every temperature, every timing, every procedure,"}
	work := []segmentOverflow{
		{ID: "1", Source: source, MinPieces: 2},
		{ID: "2", Source: strings.Join(other, " "), MinPieces: 2},
	}
	options := [][][]string{{punctuationOnly, valid}, {other}}
	want := map[string][][]string{"1": {valid}, "2": {other}}
	if got := filterParsedSegmentCutOptions(work, options, "en"); !reflect.DeepEqual(got, want) {
		t.Fatalf("invalid alternative discarded valid candidates: %#v", got)
	}
	if got := filterParsedSegmentCutOptions(work, [][][]string{{punctuationOnly}, {other}}, "en"); !reflect.DeepEqual(got, map[string][][]string{"2": {other}}) {
		t.Fatal("invalid item poisoned an unrelated valid source", got)
	}
}

func TestSegmentedParsedOptionsRetainExistingValidation(t *testing.T) {
	for _, test := range []struct {
		source string
		parts  []string
		min    int
	}{
		{"Keep every source word.", []string{"Keep every", "word."}, 2},
		{"Keep every source word.", []string{"Keep ever", "y source word."}, 2},
		{"Keep every source word.", []string{"Keep every", "source word."}, 3},
		{strings.Repeat("word ", 16) + "tail.", []string{strings.TrimSpace(strings.Repeat("word ", 16)), "tail."}, 2},
	} {
		work := []segmentOverflow{{ID: "1", Source: test.source, MinPieces: test.min}}
		if got := filterParsedSegmentCutOptions(work, [][][]string{{test.parts}}, "en"); got != nil {
			t.Fatal("accepted invalid candidate", test, got)
		}
	}
}
