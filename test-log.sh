OUT="line1
line2
line3"

NUM_LINES=$(echo "$OUT" | wc -l)
echo "NUM_LINES: $NUM_LINES"
LAST_LINE=1
echo "$OUT" | awk -v start=$((LAST_LINE + 1)) 'NR >= start'
