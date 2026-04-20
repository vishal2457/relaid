package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"relaid/internal/config"
	"relaid/internal/db"
)

var (
	flags = flag.NewFlagSet("migrate", flag.ExitOnError)
)

func main() {
	flags.Usage = usage
	flags.Parse(os.Args[1:])

	args := flags.Args()
	if len(args) == 0 || args[0] == "-h" || args[0] == "--help" {
		flags.Usage()
		return
	}

	command := args[0]

	if command != "up" {
		log.Fatalf("unsupported command %q: only 'up' is implemented for the embedded sqlite migrations", command)
	}

	cfg := config.Load()
	database, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer func() {
		if err := database.Close(); err != nil {
			log.Fatalf("close database: %v", err)
		}
	}()

	if err := database.Migrate(context.Background()); err != nil {
		log.Fatalf("migrate %v: %v", command, err)
	}
}

func usage() {
	fmt.Println(usagePrefix)
	flags.PrintDefaults()
	fmt.Println(usageCommands)
}

var (
	usagePrefix = `Usage: migrate COMMAND
Examples:
    migrate status
`

	usageCommands = `
Commands:
    up                   Apply embedded sqlite migrations`
)
