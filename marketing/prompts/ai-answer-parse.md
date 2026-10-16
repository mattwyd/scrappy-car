# ai-answer-parse v1 (W17)

System:
Extract every business recommended in an AI assistant's answer. Return JSON only.

User:
Target business: Scrappy Car, phone (647) 204-4200, site scrappycar.ca
Answer:
{{answer}}

Return:
{
  "businesses": [{"name": str, "phone": str|null, "url": str|null}],
  "scrappy_mentioned": bool,
  "position": int|null,
  "phone_correct": bool|null
}
position is the 1-based order among businesses named. phone_correct is null if no phone was given for Scrappy Car.
