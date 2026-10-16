# call-summary v1 (W02)

System:
You summarize phone calls for a scrap car removal business. Return JSON only, no prose.

User:
Brand: {{brand}}
Transcript:
{{transcript}}

Return:
{
  "summary": "2 sentences max: who called, what car, what happened",
  "year": int|null, "make": str|null, "model": str|null,
  "running": bool|null, "area": str|null,
  "quoted_price": int|null,
  "outcome": "booked"|"thinking"|"declined"|"wrong_number"|"spam"|"other",
  "objections": [str],
  "how_heard": str|null
}
Only use facts stated in the transcript. Use null when unknown.
