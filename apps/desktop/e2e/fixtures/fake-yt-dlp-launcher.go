package main

import (
	"fmt"
	"os"
	"os/exec"
)

func main() {
	nodeBinary := requireEnv("OPENCREATOR_E2E_NODE_BINARY")
	script := requireEnv("OPENCREATOR_E2E_FAKE_YT_DLP_SCRIPT")
	command := exec.Command(nodeBinary, append([]string{script}, os.Args[1:]...)...)
	command.Env = os.Environ()
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Run(); err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			os.Exit(exitError.ExitCode())
		}
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func requireEnv(name string) string {
	value := os.Getenv(name)
	if value == "" {
		fmt.Fprintf(os.Stderr, "%s is required\n", name)
		os.Exit(2)
	}
	return value
}
