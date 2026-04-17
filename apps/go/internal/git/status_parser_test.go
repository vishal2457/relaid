package git

import "testing"

func TestParseStatusPorcelainV1Z(t *testing.T) {
	out := "" +
		" M modified.txt\x00" +
		"?? new file.txt\x00" +
		"R  renamed.txt\x00old name.txt\x00" +
		"MM partial.txt\x00" +
		"T  script.sh\x00" +
		" T symlink.txt\x00"

	staged, unstaged := parseStatusPorcelainV1Z(out)

	assertStatuses(t, staged, []FileWithStatus{
		{Path: "renamed.txt", Status: "renamed"},
		{Path: "partial.txt", Status: "modified"},
		{Path: "script.sh", Status: "typechanged"},
	})
	assertStatuses(t, unstaged, []FileWithStatus{
		{Path: "modified.txt", Status: "modified"},
		{Path: "new file.txt", Status: "untracked"},
		{Path: "partial.txt", Status: "modified"},
		{Path: "symlink.txt", Status: "typechanged"},
	})
}

func TestParseStatusPorcelainV1ZHandlesCopyAndIgnoredEntries(t *testing.T) {
	out := "" +
		"C  copied.txt\x00source.txt\x00" +
		"!! dist/generated.js\x00" +
		"UU conflicted.txt\x00"

	staged, unstaged := parseStatusPorcelainV1Z(out)

	assertStatuses(t, staged, []FileWithStatus{
		{Path: "copied.txt", Status: "copied"},
		{Path: "conflicted.txt", Status: "unmerged"},
	})
	assertStatuses(t, unstaged, []FileWithStatus{
		{Path: "dist/generated.js", Status: "ignored"},
		{Path: "conflicted.txt", Status: "unmerged"},
	})
}

func assertStatuses(t *testing.T, got, want []FileWithStatus) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("unexpected status count: got %d want %d\n got=%v\nwant=%v", len(got), len(want), got, want)
	}

	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected status at %d: got %+v want %+v", i, got[i], want[i])
		}
	}
}
