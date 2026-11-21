# CompassAI — 2-Minute Live Demo Script

**Live URL**: [https://ai-powered-map-application.vercel.app/?debug=1](https://ai-powered-map-application.vercel.app/?debug=1)  
**Viewport**: Mobile emulation (390 × 844, iPhone 14/15 profile)  
**Emulated Geolocation**: Pari Chowk, Greater Noida (`lat: 28.4631, lng: 77.5081`)

---

## Demo Script Table

| Time | What I do | What I say | Expected result |
| :--- | :--- | :--- | :--- |
| **0:00** | Open live URL with empty search bar. Ensure clean mobile view. | "Traditional maps make you search, bounce between apps, and manually plan routes. CompassAI is an AI assistant that directly drives the map." | Interactive vector map loads centered on Greater Noida. Search bar is empty. AI assistant launcher bubble is visible at bottom-right. |
| **0:15** | Tap locate button (top-right), open AI chat panel, and type: `Find a hospital near me`. | "I locate myself at Pari Chowk and ask for a nearby hospital. The model queries our local PostGIS database using tools rather than answering from memory." | Map centers on Pari Chowk. Assistant responds in under 3 sentences with local hospitals and renders interactive hospital cards with ratings and distance. |
| **0:35** | Tap on a hospital card in the chat to open its sheet and view the insight card. | "Tapping a place opens review insights with pros, cons, and vibe. As labeled, these ratings and reviews are AI-generated sample demonstration data." | POI details sheet slides up showing category tags and the InsightCard clearly labeled as sample review synthesis. |
| **0:50** | Open Preferences in chat header, select **Parks & Nature**, **Any** budget, **Walk** transport, tap Save, and prompt: `what should I do nearby?`. | "I'll save my preferences for parks and walking. The ranking formula boosts relevant categories by 30% in code, without hallucinating budget figures." | Assistant returns walking-friendly park recommendations with match reasons based on user interests. |
| **1:05** | Send multi-stop errand prompt: `I need a pharmacy and an ATM, then a hospital`. | "Now an errand with multiple stops. The stop order is calculated by the Mapbox routing service to minimize travel, not guessed by the model." | StopsCard appears with optimized sequence: 1. Ratan Medicos (518 m) $\rightarrow$ 2. Union Bank of India (1.3 km) $\rightarrow$ 3. Nimt Hospital (final stop; 5.7 km total, 12 min drive). |
| **1:25** | Tap Start Navigation on the route, tap Simulate, then tap Divert. | "Starting navigation: this drive is simulated. When I divert 100 meters off-route, the detector catches three consecutive fixes and automatically recalculates the route." | NavPanel provides maneuver instructions; simulator advances along route; Divert triggers 'Rerouting: you left the route' banner and reroutes. |
| **1:50** | Tap End navigation to return to the interactive map overview. | "CompassAI turns natural conversation into verified spatial actions—real routes, real places, grounded strictly in tools." | Navigation ends cleanly, returning to the interactive map. |

---

## Final Errand Choice & Prompt

- **Exact Prompt**: `I need a pharmacy and an ATM, then a hospital`
- **Starting Point**: Pari Chowk (`lat 28.4631, lng 77.5081`)
- **Optimized Stop Sequence**:
  1. **Stop 1 (Pharmacy)**: Ratan Medicos Pvt. Ltd. (518 m)
  2. **Stop 2 (ATM)**: Union Bank of India (1.3 km)
  3. **Stop 3 (Hospital)**: Nimt Hospital (final destination hospital)
- **Metrics**: 3 stops planned, 5.7 km total distance, ~12 min total ETA (drive mode). Demonstrates clear sequence optimization with the hospital correctly ordered as the final destination.

---

## If Something Goes Wrong (Fallbacks)

*Rule: Never retry more than once on stage.*

1. **Model Busy / Rate Limit**:
   - *What to say*: "The AI service is experiencing heavy traffic, but direct map search and routing remain available."
   - *Action*: Use the top search bar to type the place name directly or tap a category in the Legend.
2. **Location Denied / Timeout**:
   - *What to say*: "Location access wasn't granted, so I'll tap on the map to set my starting point manually."
   - *Action*: Long-press Pari Chowk on the map to drop a pin and set the origin.
3. **Route Calculation Fails**:
   - *What to say*: "No driving route was returned between these coordinates, so we can adjust our stops or transport mode."
   - *Action*: Switch travel mode toggle to Walk or select an alternate nearby POI card.

---

## Quota & Rate Limits Note

- Each full demo run incurs approximately 3 to 4 chat completion requests.
- The `/api/chat` endpoint is governed by an in-memory sliding-window rate limiter:
  - **Burst limit**: 12 requests per minute per IP.
  - **Hourly limit**: 150 requests per hour per IP.
  - **Daily cap**: Optional daily request ceiling (`CHAT_DAILY_CAP`).
- **Demo pacing recommendation**: Allow 15–20 seconds between queries to keep request volume under 6–8 requests per minute during stage rehearsals and recordings.
