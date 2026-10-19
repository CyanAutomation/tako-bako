/** Completed puzzles must not be reported as abandoned when progression loads the next one. */
export function shouldRecordPuzzleAbandoned(hasPuzzle: boolean, puzzleCompleted: boolean): boolean {
  return hasPuzzle && !puzzleCompleted;
}
