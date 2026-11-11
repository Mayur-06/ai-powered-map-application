# **AI Map Application: Implementation Plan** 

Working demo in 7 days 

## **1. Project Summary** 

We are building a web map application with an embedded AI assistant. The map handles the fundamentals (display, GPS, search, routing, POIs, zoom and scale). The AI layer sits on top and controls the map through tool calls, so a user can say "find a quiet cafe with good Wi-Fi near me and take me there" and the map pans, drops pins, draws the route and starts navigation. 

**Winning angle:** the AI is not a chatbox bolted onto a map. It _drives_ the map. Every AI answer should produce a visible map action (pins, route, highlighted POI). That is the demo moment judges will remember. 

**Scope rule for a one-week hackathon:** a polished, reliable core plus 3 to 4 impressive AI moments beats a wide feature list that half works. 

## **2. Architecture** 

|Layer|Choice|Role|
|---|---|---|
|Frontend|Next.js (App Router), Tailwind CSS,<br>shadcn/ui|UI, chat panel, bottom sheets, cards|
|Map|react-map-gl (Mapbox GL JS)|Rendering, markers, layers, GPS control,<br>scale/zoom|
|Mapbox APIs|Geocoding / Search Box, Directions,<br>Optimization|Search, routing, multi-stop ordering|
|Backend|Route Handlers(<br>/api/chat,<br>/api/route)<br>and Server Actions|AI streaming, secure API keys, DB access|
|AI|Vercel AI SDK (see section 3)|Streaming chat, tool calling, structured<br>output|
|Database|Supabase (Postgres + PostGIS +<br>pgvector)|POIs, reviews, user prefs, saved places|
|Hosting|Vercel|One-click deploy, a live URL for judges|



**Data flow:** the user types or speaks in the chat panel; <mark>/api/chat</mark> streams to the LLM; the LLM calls tools (search places, get route, summarize reviews); tool results stream back to the client; the client turns tool results into map actions (fly to, add markers, draw a route line). 

Chat UI --> /api/chat (AI SDK streamText + tools) |-- searchPlaces   --> Supabase PostGIS / Mapbox Search |-- getRoute       --> Mapbox Directions 

|-- optimizeStops  --> Mapbox Optimization 

|-- summarizeReviews --> Supabase + LLM 

|-- getUserPrefs   --> Supabase <-- streamed text + tool results --> Map state store (Zustand) 

## **3. LangChain.js vs Vercel AI SDK: Decision** 

|Criterion|Vercel AI SDK|LangChain.js|
|---|---|---|
|Next.js streaming and<br>useChat|Native, minimal code|Needs adapters|
|Tool calling with typed schemas|Simple (zod)|Supported, more boilerplate|
|Learning curve and speed|Fast|Slower, heavier abstractions|
|Complex agents, RAG pipelines|Basic|Stronger|
|Bundle and debugging|Light, clear|Heavier|



**Recommendation: use Vercel AI SDK as the single orchestration layer.** Our needs (streaming chat, 5 to 6 tools, structured JSON output, one RAG-style query) are all well covered, and it saves the most time. 

**Middle path:** if we later need something LangChain does better (for example document loaders or a complex multi-step agent graph), import just that one utility inside a server tool. Do not adopt LangChain as the framework. Keeping one orchestration layer keeps the codebase explainable to judges. 

**Free LLM provider: Google Gemini through Google AI Studio (** **<mark>@ai-sdk/google</mark> ).** Its free tier needs no billing, supports streaming and tool calling through the AI SDK, and also covers a Gemini embedding model for semantic search, so one key serves chat and embeddings. Google no longer publishes permodel request limits in its docs; they show only in the AI Studio rate-limit console, so check them on Day 1 and keep the model name in one environment variable. Free-tier requests may be used by Google to improve its products, so send only demo data, never real user information. 

**Fallback:** one free provider with an AI SDK adapter (Groq or OpenRouter free models). Switching is a one-line change in <mark>lib/ai/model.ts</mark> ; confirm its current limits before relying on it. 

#### **Designing for free-tier limits:** 

- Pre-generate review summaries and embeddings in the seed scripts, so the only runtime LLM calls are chat turns. 

- Cap tool-call steps at 4 per chat turn and cache repeated queries. 

- Use a fast Flash-class model for chat; do not chase the biggest model. 

- On a 429 error, show a short "busy, retrying" message and switch to the fallback provider. 

## **4. Feature Implementation** 

### **4.1 Core map features** 

|Feature|How to build it|
|---|---|
|Interactive map|<Map>from react-map-gl with a custom Mapbox Studio style;|



|Feature|How to build it|
|---|---|
||support light and dark styles|
|Geolocation|GeolocateControlwith<br>trackUserLocationand heading; store<br>coords in a Zustand store for the AI to use as context|
|Search and geocoding|Debounced search bar using the Mapbox Search Box API (suggest<br>then retrieve); reverse geocode on map long-press|
|Routing and navigation|Directions API with<br>steps=true; draw the route as a GeoJSON line<br>layer; a turn-by-turn panel; speak instructions via the browser<br>Web Speech API|
|POIs and legends|Supabase<br>poistable rendered as a clustered GeoJSON source;<br>category icons; a legend component driven by a category config;<br>click opens a shadcn Sheet with details|
|Scale and zoom|ScaleControl,<br>NavigationControl(zoom and compass), plus a<br>2D/3D pitch toggle|



### **4.2 AI features** 

**Conversational search.** The <mark>searchPlaces</mark> tool accepts structured filters (category, keywords, radius, open now, price) extracted by the LLM from natural language, then queries PostGIS with <mark>ST_DWithin</mark> . For vague, vibe-based queries ("cozy place to study"), add semantic search: store a pgvector embedding for each POI description and review summary, and rank by cosine similarity combined with distance. 

#### **Intelligent route optimization and dynamic rerouting.** 

- _Optimization:_ when a user lists errands, the <mark>optimizeStops</mark> tool calls the Mapbox Optimization API to order stops, and the AI explains the ordering in one sentence. 

- _Dynamic rerouting:_ on the client, watch GPS position with <mark>turf.js (nearestPointOnLine</mark> ). If the user is more than about 40 m off route, or a traffic-aware ETA (profile <mark>driving-trafc</mark> fi ) worsens by a threshold, re-request the route. The AI posts a short explanation such as "Traffic ahead on the Noida–Greater Noida Expressway, switched route, saves 6 min." 

- _Demo safety:_ include a hidden "simulate off-route" button so rerouting can be shown reliably on stage without driving. 

**Review and insight summarization.** The <mark>summarizeReviews</mark> tool fetches the reviews for a POI and returns structured output via <mark>generateObject</mark> with a zod schema: <mark>{ pros[], cons[], bestFor[], vibe, sentimentScore }</mark> . Cache the result in the <mark>pois</mark> row so repeat views are instant. 

**Personalized recommendations.** Store preferences ( <mark>likes: ["cof</mark> f <mark>ee","parks"]</mark> , budget, dietary, transport mode) plus saved and visited places. Pass a compact profile into the system prompt, and let the AI rerank search results by it, with a one-line reason per result ("Because you like quiet workspaces"). Onboarding can be a three-question chip selector, so personalization works immediately in the demo. 

## **5. Database Design (Supabase)** 

Enable the <mark>postgis</mark> and <mark>vector</mark> extensions. 

|Table|Key columns|
|---|---|
|pois|id, name, category, description,<br>geom geography(Point,4326), address,<br>rating, price_level, hours (jsonb), embedding<br>vector(768), summary (jsonb,<br>cached)|
|reviews|id, poi_id, author, rating, text, created_at|
|profiles|user_id, preferences (jsonb), home/work geom|
|saved_places|user_id, poi_id, note|
|trips|user_id, stops (jsonb), route_geojson, created_at|



Add a GIST index on <mark>geom</mark> . Expose a Postgres function <mark>nearby_pois(lat, lng, radius_m, category,</mark> 

<mark>query_embedding)</mark> and call it through <mark>supabase.rpc</mark> . Use Row Level Security on user-owned tables, and Supabase Auth (Google login) only if time allows. 

**Seed data:** load 150 to 300 real POIs for one demo city from OpenStreetMap (Overpass API) or Mapbox. Generate 5 to 10 realistic reviews per POI with a one-off LLM script, label them as sample data in the UI, and compute each summary and embedding in the same run so demo-day calls stay within the free quota. The demo city is Greater Noida: query Overpass with a bounding box around it (Knowledge Park, Pari Chowk and nearby sectors) and keep that area dense in data. 

## **6. AI Tool Definitions** 

Define tools with zod schemas in /api/chat, using streamText with a step limit so the model can chain calls (cap at 4 steps). Use the syntax of the installed AI SDK version: v5 and later uses stopWhen: stepCountIs(4) and inputSchema; v4 uses maxSteps and parameters. 

|Tool|Input|Returns|Map effect|
|---|---|---|---|
|searchPlaces|query, category, radius,<br>filters|list of POIs|Drop pins, fit bounds|
|getRoute|origin, destination,<br>mode|geometry, ETA,<br>steps|Draw route, start navigation|
|optimizeStops|list of places, start point|ordered stops, total<br>time|Numbered markers, multi-<br>leg route|
|summarizeReviews|poi_id|pros, cons, vibe|Insight card on POI sheet|
|getUserContext|none|location, prefs,<br>saved places|None (context)|
|mapControl|action (flyTo, setStyle,|ok|Camera or layer change|



|Tool|Input|Returns|Map effect|
|---|---|---|---|
||toggleLayer)|||



**System prompt essentials:** the assistant is a local navigation guide; always use tools instead of inventing places; keep replies under 3 sentences plus cards; always ask or assume the user's current location from context; never fabricate ratings. 

**Client handling:** render <mark>tool-invocation</mark> parts from <mark>useChat</mark> as cards in the chat (place cards, route summary), and dispatch each tool result to a Zustand <mark>mapStore</mark> that the map component subscribes to. 

## **7. Project Structure** 

/app /page.tsx                  main map + chat layout /api/chat/route.ts         AI streaming endpoint /api/route/route.ts        directions proxy /actions                   server actions (save place, prefs) /components /map  (MapView, RouteLayer, PoiLayer, Legend, NavPanel) /chat (ChatPanel, PlaceCard, RouteCard, InsightCard) /ui   (shadcn) /lib /ai (tools.ts, prompts.ts, model.ts) /supabase (client.ts, queries.ts) /store (mapStore.ts) /scripts  seed-pois.ts, generate-reviews.ts, embed-pois.ts **Environment variables:** <mark>NEXT_PUBLIC_MAPBOX_TOKEN</mark> (public, URL-restricted), <mark>MAPBOX_SECRET_TOKEN</mark> , <mark>SUPABASE_URL</mark> , <mark>SUPABASE_ANON_KEY</mark> , <mark>SUPABASE_SERVICE_ROLE_KEY</mark> (server only), <mark>GOOGLE_GENERATIVE_AI_API_KEY</mark> , <mark>LLM_MODEL</mark> . 

**Cut list if behind schedule (drop in this order):** voice output, 3D buildings, auth, saved trips, semantic search (fall back to keyword filters). 

## **9. Demo Script (about 2 minutes)** 

1. Open the app; the map centers on the user. State the problem in one line. 

2. Ask: "I need a quiet place to work for 2 hours, under 300 rupees, near Knowledge Park." Pins appear with reasons tied to the profile. 

3. Tap a result; the review insight card shows pros, cons and best-for. 

4. Say: "Take me there, and stop at a pharmacy on the way." The AI optimizes the stops and starts navigation. 

5. Trigger the simulated off-route; the app reroutes and explains why. 

6. Close with the architecture slide and the "AI drives the map" message. 

## **10. Risks and Mitigations** 

|Risk|Mitigation|
|---|---|
|Mapbox or LLM rate limits and costs|Cache geocoding and summaries; pre-generate<br>summaries offline; cap tool steps; fall back to a<br>second free provider on 429|
|AI hallucinated places|Tools only; the model may mention only places<br>returned by tools|
|Venue Wi-Fi or GPS unreliable|Backup demo video; mock-location mode; pre-<br>warmed cache|
|Scope creep|Follow the cut list; freeze features at end of Day 6|
|API key leakage|Server-side keys only; restrict the public Mapbox<br>token by URL|
|Slow AI responses|Stream everything; show skeleton cards and tool-<br>progress messages|



## **11. Judging Checklist** 

- Does the AI visibly control the map? Yes, via tools. 

- Is it live, deployed and mobile friendly? 

- Is there a clear problem statement and target user (commuters, tourists or students)? 

- Is the architecture explained clearly in a single diagram? 

- Is there a polished UI with a distinct visual identity and a memorable name? 

Demo city is Greater Noida and the LLM is Gemini's free tier with a free fallback 

