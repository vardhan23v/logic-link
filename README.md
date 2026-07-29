# Logic Link

Build a Deterministic Number Match Puzzle Game Engine

Role

You are a Senior Game Systems Engineer, Gameplay Programmer, Procedural Generation Specialist, and Algorithm Designer.

Your primary responsibility is to build the entire gameplay engine, not the UI.

The focus is creating a deterministic, mathematically solvable, configurable puzzle engine that replaces random number generation while maintaining fairness, replayability, and a carefully controlled difficulty progression.

Phase 0 – Study the Reference Game (Mandatory)

Before writing any code, thoroughly analyse and understand the gameplay of the reference application:

https://play.google.com/store/apps/details?id=com.ezygamers.sumlinknumbergame

Study every gameplay behaviour including but not limited to:

Number generation

Board layout

Match detection

Valid move logic

Row expansion

Row deletion

Wrap-around matching

Progression

User flow

Board clearing behaviour

Add Row (+) behaviour

Winning conditions

Losing conditions

The reference application is the behavioural baseline.

Replicate all gameplay mechanics unless this specification explicitly overrides them.

Do not make assumptions without comparing against the reference game.

Project Objective

The current game relies on Random Number Generation (RNG).

Random generation causes inconsistent gameplay.

Examples:

Level 1 occasionally becomes extremely difficult.

Level 10 occasionally becomes easier than beginner levels.

Some boards feel unfair.

Difficulty varies unpredictably.

The objective is to completely replace RNG with a Deterministic Game Engine that guarantees:

Every board is mathematically solvable.

Difficulty follows a controlled progression.

The experience remains fair.

Different solving orders never create impossible situations.

Add Row intelligently assists the player instead of randomly generating numbers.

Core Philosophy

Never generate random numbers first.

Instead:

Generate valid matches first.

Then place them strategically.

Then inject controlled decoys.

Then validate solvability.

Only after validation should the board be shown.

Game Rules

Grid Width

9 columns

Initial Board

Exactly 3 rows populated.

Rows expand dynamically.

Player has an Add Row (+) button.

Maximum Add Row usage per level:

6

Rows disappear automatically when completely cleared.

Matching Rules

Two numbers can match when:

Same number

Example

5 ↔ 5

or

Their sum equals 10

Examples

1 ↔ 9

2 ↔ 8

3 ↔ 7

4 ↔ 6

5 ↔ 5

Matches are valid in:

Horizontal

Vertical

Diagonal

Wrap-around (last cell of one row to first cell of next row)

These rules must exactly match the reference application.

Winning Condition

The level is complete only when every number has been removed.

The board must become empty.

Architecture

Implement clean modular architecture.

Suggested modules:

Level Configuration

Contains configurable parameters.

Examples:

difficulty score

match density

direct pair preference

buried pair preference

helper strength

decoy strength

clustering

scanning complexity

expected Add Row distribution

target completion probability

No gameplay constants should be scattered throughout the code.

Everything must come from configuration.

Pair Graph Generator

Never place numbers randomly.

Generate all legal pairs first.

Examples

5-5

8-2

6-4

9-1

This creates the graph representing the puzzle solution.

Board Layout Engine

Place generated pairs into board positions.

Control:

visible matches

hidden matches

scanning effort

clustering

spacing

path complexity

Avoid illegal overlaps.

Decoy Injector

Only after required pairs exist.

Fill remaining spaces using decoys.

Decoys should:

increase scanning effort

increase challenge

never break solvability

Internal Solver

Before any board is accepted:

Run the internal solver.

If solver cannot clear the board

Reject it.

Generate again.

Never allow an unsolvable board.

Order-Independent Fairness (Critical)

The puzzle must remain fair regardless of which valid matches the player chooses first.

The board must not depend on one perfect solving sequence.

Different legal solving paths should still keep the board within the intended difficulty.

Avoid situations where:

one valid move creates an impossible future

another valid move makes the board trivial

Difficulty must remain bounded regardless of legal move order.

Where practical, validate multiple solving paths rather than a single successful solution.

Smart Add Row System

The current game appends random numbers.

Replace this completely.

Pipeline:

Board Analysis

↓

Need Detection

↓

Smart Row Generator

↓

Validation

↓

Insert Row

Board Analysis

Continuously analyse:

remaining legal pairs

isolated numbers

dead cells

blocked cells

incomplete rows

single-cell rows

future matching opportunities

player progress

Smart Row Generation

Generate numbers according to board needs.

Possible goals:

Immediate Match

Future Match

Relief

Controlled Decoy

Cleanup

Difficulty Adjustment

Never append random numbers.

Rescue Mechanic

Detect frustration.

Example:

Player presses Add Row twice.

Still no legal matches exist.

Trigger Rescue Mode.

Rescue Mode must guarantee an immediate legal move.

Examples:

7 beside 3

5 beside 5

Reset frustration counter afterwards.

This rescue mechanism should override normal difficulty only when necessary.

Straggler Cleanup

Continuously detect rows containing very few remaining numbers.

Especially:

Rows with exactly one remaining number.

Prioritise clearing these rows.

Generate complementary numbers nearby.

Goal:

Prevent endless sparse boards.

Keep gameplay visually tidy.

Reduce unnecessary scrolling.

Difficulty Curve

Do NOT increase difficulty linearly.

Implement a sawtooth progression.

Levels 1–5

Gradually increase challenge.

More buried matches.

More scanning.

More decoys.

Level 5 is the first major difficulty peak.

Level 6

Difficulty drops.

It should feel similar to approximately Level 3.

Players should feel a "breath of fresh air."

Levels 7–10

Difficulty increases again.

Every level should exceed the previous peak.

Level 10 must be significantly harder than Level 5.

Level 11

Difficulty drops again before beginning another cycle.

Difficulty should influence:

match density

helper behaviour

decoy behaviour

scanning complexity

hidden matches

Add Row assistance

Statistical Difficulty Targets

There is NO gameplay timer.

The "Target Time" values represent expected completion time measured through playtesting.

The objective is:

Approximately 95% of normal players should complete each level around the intended completion time.

Examples

Level 1

Target completion

≈45 seconds

Target completion probability

≈95%

Expected Add Row usage

90% of players should complete after exactly one Add Row.

Around 10% may require additional Add Rows.

Level 3

≈90 seconds

Most players should complete using 2–3 Add Rows.

Level 5

≈150 seconds

Most players should complete using 2–3 Add Rows.

Scanning effort should be substantially higher.

Level 6

≈90 seconds

Relief level.

Most players should require roughly 2–4 Add Rows.

Continue increasing target completion time gradually until Level 10.

These are statistical goals rather than strict per-game requirements.

Exception Clause

The statistical targets apply to normal gameplay.

It is acceptable to exclude intentionally abnormal behaviour from these metrics.

Examples:

repeatedly pressing Add Row immediately at the start

exhausting all six Add Rows without making matches

intentionally attempting to break the game

These edge cases do not need to satisfy the probability targets.

Automated Validation

Implement automated simulation.

Create AI players of varying skill levels.

Examples:

Beginner

Average

Advanced

Run thousands of simulated games for every level.

Measure:

completion probability

average completion time

Add Row usage

failure rate

rescue activation frequency

average remaining board size

Compare results against target metrics.

The engine should expose configuration values so difficulty can be tuned based on simulation results.

Code Quality

Use clean architecture.

Separate:

board generation

pair generation

difficulty

solver

validator

Add Row logic

simulation

analytics

Avoid giant classes.

Write maintainable, testable code.

Document algorithms thoroughly.

UI Requirements

UI is NOT the priority.

A simple functional interface is sufficient.

No polished graphics are required.

Development effort should focus almost entirely on gameplay logic and deterministic algorithms.

Deliverables

Provide:

Complete source code.

Well-structured GitHub repository.

Playable APK.

Short demonstration video showing gameplay.

README explaining setup and architecture.

Detailed algorithm write-up explaining:

deterministic board generation

solver

Add Row logic

rescue mechanic

straggler cleanup

difficulty system

statistical balancing approach

Unit tests validating:

every generated board is solvable

Add Row never creates impossible boards

rescue mechanism always generates a legal move

difficulty configuration behaves correctly

Simulation framework for validating completion probability and difficulty targets.

Timeline

Target completion:

3–5 days.

Success Criteria

The project will be considered successful if:

No board is unsolvable.

Gameplay feels fair and deterministic.

Difficulty follows the specified sawtooth progression.

Different legal solving orders do not create unfair difficulty spikes.

Add Row intelligently helps the player while preserving challenge.

Rescue and Straggler Cleanup work reliably.

Difficulty is fully configurable.

The engine can be statistically tuned to achieve approximately 95% completion probability and the desired Add Row usage distributions for each level.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8264eb11-7878-47b7-8416-057b5145bb88).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
