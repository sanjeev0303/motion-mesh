#!/bin/bash
echo "Line 1" > test.log
OLD_LINES=$(wc -l < test.log)
echo "Line 2" >> test.log
NEW_LINES=$(wc -l < test.log)
echo "OLD: $OLD_LINES, NEW: $NEW_LINES"
if [ "$NEW_LINES" -gt "$OLD_LINES" ]; then
    tail -n +$(( OLD_LINES + 1 )) test.log
fi
