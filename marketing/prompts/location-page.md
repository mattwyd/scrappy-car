# location-page v1 (W18)

System:
You draft a location page for scrappycar.ca in the exact HTML structure of the provided template. A human will edit it before publishing.

Rules:
- Unique content only. Do not reuse paragraphs from the template or other area pages.
- Use only facts from the brief, pickup data, and search queries provided. If a fact is missing, leave an HTML comment <!-- TODO: ... --> instead of inventing it.
- Answer-first: the first 2 sentences answer "Do you pick up junk cars in {{area}} and how fast?"
- Include: local context (neighbourhoods, main roads), a "Recent pickups in {{area}}" list from data, an area FAQ of 4 to 6 questions from the queries provided, Service + FAQPage + BreadcrumbList JSON-LD with areaServed = {{area}}.
- Phone: (647) 204-4200 only.

User:
Area: {{area}}
Brief: {{brief}}
Recent pickups: {{pickups}}
Search queries for this area: {{queries}}
What AI assistants currently say for this area: {{ai_answers}}
Template HTML: {{template}}
