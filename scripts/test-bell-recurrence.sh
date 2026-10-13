#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "${JAVA_HOME:-}" ]]; then
  JAVAC="$JAVA_HOME/bin/javac"
  JAVA="$JAVA_HOME/bin/java"
else
  JAVAC=javac
  JAVA=java
fi
mkdir -p generated-artifacts/recurrence-tests
"$JAVAC" -d generated-artifacts/recurrence-tests \
  artifacts/bellcraft/android/app/src/main/java/com/bellcraft/app/BellRecurrence.java \
  artifacts/bellcraft/android/recurrence-tests/BellRecurrenceTest.java
"$JAVA" -cp generated-artifacts/recurrence-tests com.bellcraft.app.BellRecurrenceTest
