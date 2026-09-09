# OpenCreator writing templates

This package is the registry shared by the Web template library and the Daemon writing pipeline.

```text
template.json + Markdown resources + LICENSE
                    |
                    v
          build-catalog.mjs validation
                    |
                    v
        generated read-only catalog
             /              \
        Web metadata     Daemon stage prompts
```

The application never executes code from a writing template and never fetches a moving GitHub branch at generation time. Community sources are copied into the repository after review, pinned to a commit SHA, attributed, hashed, and loaded only from the built catalog.

`skill.stageResources` binds resources to `topics`, `outline`, `article`, and `review`. This keeps topic generation small while allowing article generation to load richer rules and a final checklist.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the pull request format and validation rules.
