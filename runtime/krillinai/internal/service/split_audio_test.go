package service

import (
	"reflect"
	"testing"
)

func TestFinalizeSplitPointsKeepsOnlyShortSegment(t *testing.T) {
	got := finalizeSplitPoints([]float64{0, 0}, 5.6)
	want := []float64{0, 5.6}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("finalizeSplitPoints() = %v, want %v", got, want)
	}
}

func TestFinalizeSplitPointsMergesShortTrailingSegment(t *testing.T) {
	got := finalizeSplitPoints([]float64{0, 300, 0}, 305)
	want := []float64{0, 305}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("finalizeSplitPoints() = %v, want %v", got, want)
	}
}

func TestFinalizeSplitPointsKeepsNormalTrailingSegment(t *testing.T) {
	got := finalizeSplitPoints([]float64{0, 300, 0}, 330)
	want := []float64{0, 300, 330}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("finalizeSplitPoints() = %v, want %v", got, want)
	}
}
