# **Day-wise Implementation Guide: AI Map App** 

Seven days, three sub-phases each: what to build, how, why, and what to do and avoid, so the coding agent stays on the goal and finishes on time. 

## **Day 1: Foundation, live map and GPS** 

Goal: a live Vercel URL showing the map, controls and your GPS dot, with the database reachable. 

### **1.1 Scaffold and deploy (45 min)** 

- **What:** the Next.js app, Tailwind, shadcn/ui, the folder structure, and an empty page live on Vercel. 

- **How:** run create-next-app (TypeScript, App Router, Tailwind), then init shadcn/ui. Create /components/map, /components/chat, /lib/ai, /lib/mapbox, /lib/supabase, /lib/store and /scripts. Push to GitHub and import the repo in Vercel. 

- **Why:** a live URL in the first hour surfaces deployment problems on Day 1, not on Day 7. 

- **Do:** add .env.example listing variable names only; set the same variables in Vercel. 

- **Don't:** install optional libraries 'just in case'. 

### **1.2 Map, controls and GPS (2 h)** 

- **What:** a full-screen map with zoom, compass, scale bar, geolocate button and a light/dark style. 

- • **How:** install mapbox-gl and react-map-gl. Create MapView as a client component ('use client'), import the mapbox-gl CSS, and add NavigationControl, ScaleControl and GeolocateControl (trackUserLocation, showUserHeading). Create the Zustand mapStore with userLocation, viewState, markers, selectedPoi and route. Write GPS coordinates into the store on the geolocate event. Start centered on Greater Noida (about 28.47 N, 77.50 E; verify on the map). Restrict the public Mapbox token by URL in the Mapbox dashboard. 

- **Why:** every AI tool later needs the user's location from this store. 

- **Do:** test on a real phone; handle denied location permission with a visible message. 

- **Don't:** build custom zoom or scale controls; keep map state in component-local state. 

### **1.3 Supabase foundation (1.5 h)** 

- **What:** a Supabase project with PostGIS and pgvector enabled, and server and browser clients wired. 

- **How:** run <mark>create extension if not exists postgis;</mark> and <mark>create extension if not exists vector;</mark> in the SQL editor. Install @supabase/supabase-js. Create lib/supabase/server.ts (service role key, server only) and lib/supabase/client.ts (anon key). Prove the connection with a trivial query inside a route handler. 

- **Why:** Day 3 seeding and Day 4 tools depend on a working database. 

- **Do:** keep the service role key out of any file that has 'use client'. 

- **Don't:** create tables yet, and don't set up Supabase Auth. 

**Day 1 is done when:** the live URL shows the map on your phone with the GPS dot, and the route handler returns a database result. 

## **Day 2: Search and routing** 

Goal: search for a place, get a route, and follow turn-by-turn instructions. 

### **2.1 Search with geocoding (2 h)** 

- **What:** a search bar with suggestions; choosing a result flies the map there and drops a pin; a long-press reverse-geocodes the spot. 

- **How:** create /api/search that proxies the Mapbox Search Box API (suggest, then retrieve) using one session token per search session. Debounce input by 300 ms. Show results in a shadcn Command list. On select, call retrieve, set the marker in mapStore and run flyTo. Use the Mapbox Geocoding API for the reverse lookup. 

- **Why:** search is the entry point for users, and the AI searchPlaces tool reuses it. 

- **Do:** pass proximity = user location and country = in to improve ranking. 

- **Don't:** call Mapbox with a secret token from the browser; fire a request on every keystroke. 

### **2.2 Directions and route layer (2 h)** 

- **What:** origin (GPS) and destination to a drawn route with distance, ETA and a mode switch (drive, walk, cycle). 

- **How:** write lib/mapbox/directions.ts that calls the Mapbox Directions API (profile driving-traffic for cars; walking and cycling otherwise) with geometries=geojson, overview=full, steps=true, banner_instructions=true. Return a typed RouteResult (geometry, distance, duration, steps). Expose it through /api/route. Draw it with a GeoJSON Source and line Layer, fit the view with turf bbox, and store it in mapStore. 

- **Why:** the AI getRoute tool will call the same function, so there is one implementation. 

- **Do:** put all routing logic in lib/mapbox/directions.ts. 

- **Don't:** duplicate routing code inside the AI tool; try to use a Mapbox Navigation SDK on the web. 

### **2.3 Turn-by-turn panel (2 h)** 

- **What:** a panel showing the current instruction, distance to the next maneuver and ETA, with optional spoken instructions. 

- **How:** build a usePosition() hook that returns either real GPS (watchPosition) or a simulated position. Use turf nearestPointOnLine to find progress along the route and advance the step when within about 30 m of the next maneuver. Speak each new instruction with the browser speechSynthesis API behind a toggle. 

- **Why:** navigation is a core requirement, and the Day 6 simulator plugs into the same hook. 

- **Do:** keep position source and navigation logic separate. 

- **Don't:** build rerouting yet. 

**Day 2 is done when:** you can search a place, tap Directions, and watch the instruction step advance as the position moves. 

## **Day 3: POIs and data** 

Goal: a populated Greater Noida database, with POIs on the map and a detail sheet. 

### **3.1 Schema and seed data (2.5 h)** 

- **What:** tables pois, reviews, profiles, saved_places and trips, plus 150 to 300 POIs and sample reviews. 

- **How:** write a SQL migration in /supabase/migrations using the columns from the plan (geom geography(Point,4326), embedding vector(768), summary jsonb) and a GIST index on geom. Allow public read on pois and reviews. In scripts/seed-pois.ts query the Overpass API for amenities, shops, leisure and tourism inside a bounding box about 10 km across around Greater Noida, map tags to 8 categories (cafe, restaurant, pharmacy, bank/ATM, fuel, park, hospital, shopping) and insert with the service role key. In scripts/generate-reviews.ts have the LLM write 5 to 10 reviews per POI, in batches with pauses to respect free-tier limits. 

- **Why:** the AI can only recommend what exists in the data, so density decides demo quality. 

- **Do:** dedupe by OSM id; skip POIs without a name; label reviews as sample data in the UI. 

- **Don't:** scrape Google Maps; present generated reviews as real; call the LLM once per POI in a tight loop. 

### **3.2 POI layer and legend (2 h)** 

- **What:** POIs shown as a clustered map layer with category colors, plus a legend with category toggles. 

- **How:** create the Postgres function nearby_pois(lat, lng, radius_m, category) returning id, name, category, lng, lat, rating (use ST_DWithin, ST_X, ST_Y). Fetch on map moveend (debounced). Render a GeoJSON Source with cluster=true, a cluster circle layer, a count layer and an unclustered point layer colored by category. Build Legend from one config file, lib/categories.ts (id, label, color, icon). 

- **Why:** POIs and legends are required features, and clustering keeps the map readable. 

- **Do:** keep lib/categories.ts the single source of truth for categories. 

- **Don't:** load every POI at once; use heavy custom icon images. 

### **3.3 POI detail sheet (1.5 h)** 

- **What:** tapping a pin opens a sheet with name, category, rating, address, hours, reviews and a Directions button. 

- **How:** the layer click sets selectedPoi in mapStore; fetch details by id with a server action; use the shadcn Sheet; the Directions button calls the flow from 2.2. Leave an empty slot where the Day 5 insight card will go. 

- **Why:** this sheet is where the AI review insights will appear. 

- **Do:** make the sheet usable on a phone first. 

- **Don't:** add Save or favorites yet. 

**Day 3 is done when:** pins cluster and unclusters on zoom, the legend toggles categories, and tapping a pin then Directions draws a route. 

## **Day 4: AI chat core** 

Goal: the make-or-break day. A user asks in plain language and the map responds. 

### **4.1 Chat endpoint and model (1.5 h)** 

- **What:** /api/chat streams a response from the free Gemini model with a system prompt and no tools yet. 

- **How:** install ai, @ai-sdk/google, @ai-sdk/react and zod. In lib/ai/model.ts export the model from the LLM_MODEL variable (a Flash-class model listed in your AI Studio). The route handler uses streamText and returns the stream response in the format your installed useChat expects. Put the system prompt in lib/ai/prompts.ts: a local navigation guide for Greater Noida, always use tools, answer in at most 3 sentences, never invent places, assume the user's location from context. Send user location and map bounds with every request. 

- **Why:** streaming first proves the free key, the SDK versions and the deploy all work before tools add complexity. 

- **Do:** test with short prompts to preserve free quota. 

- **Don't:** hard-code the model name; add LangChain; put the key in client code. 

### **4.2 Tools (3 h)** 

- **What:** four tools: searchPlaces, getRoute, mapControl and getUserContext. 

- **How:** define them in lib/ai/tools.ts with zod schemas and .describe() on every field so the model knows how to fill them. searchPlaces calls nearby_pois with category, radius and a keyword match on name and description. getRoute calls lib/mapbox/directions.ts. mapControl accepts flyTo, setStyle and toggleLayer. Limit a chat turn to 4 steps. Return at most 8 places with only the fields the UI needs. 

- **Why:** tools are how the AI drives the map, and compact results save free-tier tokens. 

- **Do:** return an error object instead of throwing when a tool fails. 

- **Don't:** pass raw Mapbox or database payloads back to the model; let any tool write to the database. 

### **4.3 Chat UI bridged to the map (2.5 h)** 

- **What:** a chat panel (bottom sheet on mobile, side panel on desktop) where tool results become cards and map changes. 

- **How:** use useChat and loop over message parts. A searchPlaces result sets markers in mapStore, fits bounds and renders a PlaceCard. A getRoute result sets the route and renders a RouteCard. A mapControl result moves the camera. Apply each tool result to the map exactly once, keyed by its tool call id. Show a loading state while streaming and a friendly message on rate-limit errors. 

- **Why:** this is the demo moment: the AI visibly controls the map. 

- **Do:** keep the map interactive while the chat is open. 

- **Don't:** render raw JSON; re-apply old tool results on every re-render. 

**Day 4 is done when:** typing 'find a cafe near me and take me there' drops pins and draws the route. 

## **Day 5: Intelligence** 

Goal: review insights, vibe-based search and personalized results. 

### **5.1 Review summarization (2 h)** 

- **What:** a pros, cons, best-for and vibe summary for every POI, shown in the detail sheet and available through an AI tool. 

- **How:** write a script that, for each POI, calls generateObject with a zod schema { pros, cons, bestFor, vibe, sentimentScore } over its reviews and stores the result in pois.summary. Add a summarizeReviews tool that reads the cache and generates only when the cache is empty. Build InsightCard in the empty slot from 3.3. 

- **Why:** a feature judges can see in two seconds, and pre-computing it protects the free quota. 

- **Do:** pre-generate for every POI before demo day. 

- **Don't:** summarize at runtime for lists of places; let the model add facts not in the reviews. 

### **5.2 Embeddings and semantic search (2.5 h)** 

- **What:** vibe queries such as 'cozy place to study' return sensible results. 

- **How:** with the embedding model shown in AI Studio, embed each POI's name, category, description and summary using embedMany, with output dimension 768 to match the column. Store in pois.embedding. Add a search_pois function that ranks by cosine distance (the <=> operator) combined with distance from the user. searchPlaces uses it for vibe-like queries and falls back to keywords otherwise. 

- **Why:** it makes conversational search feel intelligent rather than keyword-based. 

- **Do:** if it is not working by the end of this sub-phase, cut it (see cut list). 

- **Don't:** add an index for fewer than a few thousand rows; truncate embeddings by hand; change the column size without re-embedding. 

### **5.3 Preferences and recommendations (2 h)** 

- **What:** a three-question onboarding (interests, budget, transport) and recommendations with a one-line reason each. 

- **How:** auth is cut, so store preferences in the browser's localStorage and send a compact profile in each chat request. The getUserContext tool exposes it. The system prompt tells the model to re-rank results by the profile and give a short reason such as 'Because you like quiet workspaces'. 

- **Why:** personalization is a required AI feature and costs almost nothing to build this way. 

- **Do:** keep the profile under 100 words in the prompt. 

- **Don't:** build login, profile pages or a preferences settings screen. 

**Day 5 is done when:** the detail sheet shows an insight card, a vibe query returns relevant places, and results carry personalized reasons. 

## **Day 6: Optimization, rerouting and polish** 

Goal: all four AI features demoable, then make the app feel finished. 

### **6.1 Multi-stop optimization (2 h)** 

- **What:** 'stop at a pharmacy and an ATM on the way home' returns an ordered, routed trip. 

- • **How:** add an optimizeStops tool. It finds each stop through searchPlaces, then calls the Mapbox Optimization API (v1, maximum 12 coordinates; first point fixed as the start, round trip off). 

Draw the legs by requesting Directions with the ordered waypoints. Show numbered markers and a one-sentence explanation. 

- **Why:** this is the 'intelligent route optimization' requirement in a form judges understand instantly. 

- **Do:** cap the tool at 5 stops. 

- **Don't:** write your own ordering algorithm. 

### **6.2 Dynamic rerouting and simulator (2.5 h)** 

- **What:** automatic rerouting when off-route or when traffic worsens, plus a simulate button for demos. 

- **How:** with turf nearestPointOnLine, treat 3 consecutive fixes more than 40 m from the route as off-route and re-request Directions from the current position. Every 60 seconds compare the traffic-aware ETA and reroute if a better route saves about 3 minutes or more. Post a templated chat message ('Switched route, saves 6 min') rather than calling the LLM. Add a hidden simulator source in usePosition() that walks along the route polyline with a 'divert' button. 

- **Why:** you cannot drive on stage, and templated messages avoid spending free quota on GPS events. 

- **Do:** debounce rerouting so it cannot trigger twice in 15 seconds. 

- **Don't:** call the LLM on GPS updates. 

### **6.3 Polish and hardening (2 h)** 

- **What:** a mobile-first layout, loading skeletons, empty and error states, and a fallback provider on rate limits. 

- **How:** test at 375 px width; add skeletons for chat, sheet and search; on a 429 error switch to the fallback model defined in lib/ai/model.ts; set the app name, favicon and page title; remove console logs. 

- **Why:** polish and reliability are what judges notice after the feature list. 

- **Do:** fix only what is visible on the demo path. 

- **Don't:** add features; do large refactors. 

**Day 6 is done when:** the full demo script runs on your phone without any manual fixes. 

## **Day 7: Ship** 

Goal: a frozen, rehearsed, backed-up submission. 

### **7.1 Bug bash (2 h)** 

- **What:** a tested demo path on phone and laptop. 

- **How:** write a checklist of 10 flows (search, route, POI sheet, chat search, chat route, insight, vibe query, optimization, reroute, denied GPS) and run each on both devices. 

- **Why:** a short, checked list finds the bugs that matter. 

- **Do:** fix only bugs on the demo path. 

- **Don't:** start new features or visual redesigns. 

### **7.2 Docs and demo (2 h)** 

- **What:** README, architecture image, demo script and a backup video. 

- **How:** README with the problem, features, architecture diagram, setup steps and environment variable names. Rehearse the 2-minute script from the main plan. Record a screen video of the full flow. Run every demo query once so caches are warm. 

- **Why:** judges read the README and the backup video saves you if the venue network fails. 

- **Do:** time the script and keep it under 2 minutes. 

- **Don't:** put real keys in the README or screenshots. 

### **7.3 Freeze and final deploy (1 h)** 

- **What:** the final production deployment and a code freeze. 

- **How:** deploy, then test on a mobile hotspot to mimic venue Wi-Fi. Tag the release. After this, change code only for showstoppers. 

- **Why:** late edits are the most common cause of broken demos. 

- **Do:** keep the previous working deployment ready to promote in Vercel. 

- **Don't:** merge anything after the freeze without re-running the full checklist. 

## **Kickoff prompt template for each sub-phase** 

Read AGENTS.md (Global Rules). Today: Day N, sub-phase N.x. Build ONLY: <paste the What line>. Follow: <paste the How line>. Do not: <paste the Don't line>. When finished: list files changed, how to test it, and anything you skipped. Do not start the next sub-phase. 

