# Synthia

Synthia is a semantic software synthesis agent that transforms Spex specifications into executable systems.

Instead of generating code from ad-hoc prompts and chat history, Synthia performs inference over *spaces of valid implementations* described declaratively in Spex.

Synthia treats software development as a constraint-guided synthesis problem rather than a text completion task.

---

# Philosophy

Traditional AI coding assistants operate primarily through conversational interfaces:

```text
prompt -> completion
````

This approach has several limitations:

* architectural intent is lost across conversations
* implementations are difficult to reproduce
* abstractions are implicit and fragile
* software constraints are not formally represented
* AI agents repeatedly re-read and rediscover the same context
* reusable semantic software structures are difficult to express

Synthia takes a different approach.

A Spex specification defines:

* implementation spaces
* constraints
* dependencies
* architectural abstractions
* synthesis targets

Synthia then performs inference over those spaces to synthesize concrete implementations.

---

# Core Idea

In Synthia:

* a Spex object represents a space of valid implementations
* constraints refine that space
* synthesis becomes probabilistic inference
* code generation becomes a search problem
* reusable abstractions become reusable semantic subspaces

For example:

```spex
CREATE SecureEndpoint AS
FROM HttpRequest -> HttpResponse
SELECT {
  - the user is authenticated and authorised
  - the endpoint is rate limited
};
```

This specification does not describe *how* to implement the endpoint.

Instead, it describes the set of all valid implementations satisfying those constraints.

Synthia searches that implementation space and synthesizes concrete code.

---

# Why Synthia Exists

Synthia is designed for professional software development.

It acknowledges that:

* software engineering is fundamentally architectural
* constraints matter more than prompts
* reproducibility matters
* abstractions should persist
* software synthesis should integrate with existing tooling
* developers should guide synthesis semantically rather than conversationally

Synthia is not intended to replace programmers.

Instead, it augments professional developers by automating implementation synthesis while preserving architectural control.

---

# How Synthesis Works

Synthia performs synthesis in several stages:

```text
Spex Specification
        ↓
Semantic Graph Construction
        ↓
Constraint Lowering
        ↓
Implementation Space Construction
        ↓
Probabilistic Inference
        ↓
Candidate Generation
        ↓
Verification
        ↓
Posterior Refinement
        ↓
Generated Software
```

The language model is only one component of the system.

Synthia combines:

* symbolic reasoning
* dependency analysis
* probabilistic inference
* static verification
* repository-aware synthesis
* search and optimization

---

# Features

## Declarative Software Synthesis

Describe software semantically rather than procedurally.

```spex
CREATE slugify AS
FROM string -> string
SELECT {
  return the slugified string
};
```

---

## Compositional Abstractions

Build reusable semantic abstractions.

```spex
CREATE EmailAddress AS
FROM string
SELECT {
  are email addresses
};
```

---

## Explicit Dependency Graphs

References form explicit software dependency structures.

```spex
CREATE CreateTodo AS
FROM Todo -> Bool
SELECT {
  1. call @validate to validate the given todo
  2. throw an exception if validation failed
  3. insert the todo in the Todo table
}
```

---

## Incremental Synthesis

Synthia can synthesize only the affected portions of a codebase instead of regenerating entire projects.

---

## Repository-Aware Inference

Synthia can adapt synthesis to:

* repository conventions
* architectural patterns
* coding style
* framework preferences
* existing abstractions

---

## Verification-Guided Generation

Generated implementations can be validated through:

* type checking
* testing
* linting
* static analysis
* benchmarks
* property testing

---

# Example

```spex
CREATE TodoTitle AS
FROM string
SELECT {
  - are not empty
  - are shorter than 120 characters
};

CREATE Todo AS
(
    id: string,
    title: TodoTitle,
    completed: bool
);

CREATE CreateTodo AS
FROM (
  title: TodoTitle
) -> Todo
SELECT {
  1. generate a UUID for the todo id
  2. create a todo with completed set to false
  3. return the created todo
};

GENERATE CreateTodo
```

Synthia synthesizes a concrete implementation satisfying all specified constraints.

---

# Configuration

Synthia is configured through `spex.toml`.

Example:

```toml
[target]
language = "typescript"
runtime = "node"

[generation]
strategy = "beam-search"
beam_width = 8

[architecture]
style = "clean"
functional = true

[verification]
tests = true
typecheck = true

[workspace]
spec_dir = "./spec"
output_dir = "./src/generated"
```

---

# Design Goals

Synthia aims to provide:

* reproducible software synthesis
* compositional semantic abstractions
* declarative architecture specification
* reusable implementation constraints
* repository-aware generation
* probabilistic implementation inference
* integration with professional software engineering workflows

---

# Long-Term Vision

Synthia explores a different paradigm for software engineering:

> Software development as probabilistic inference over spaces of valid implementations.

Instead of manually constructing programs token-by-token, developers describe semantic constraints and architectural intent while Synthia synthesizes implementations that satisfy those specifications.

The long-term goal is not merely AI-assisted coding, but a new foundation for declarative software synthesis.

---

# Status

Synthia is currently experimental and under active development.

The project is in an early research and prototyping phase.

---

# Related Projects

Synthia draws inspiration from:

* SQL
* probabilistic programming languages
* refinement types
* compiler infrastructure
* program synthesis systems
* declarative programming languages

while remaining fundamentally oriented toward AI-native software synthesis.

---

# License

TBD
