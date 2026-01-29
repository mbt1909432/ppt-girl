How to add a new character (frontend)
======================================

1) Prepare assets
- Create a new folder under `public/fonts/` (e.g., `character3/`).
- Add the avatar image (for the selector) and chatbot avatar image (for in-chat UI). Keep names consistent with existing ones, e.g., `ppt girl.png` and `ppt_girl_chatbot.png`, and use transparent background PNGs.

1.5) Allow the new local image path (Next.js `next/image`)
- If you use `next/image` with `images.localPatterns` configured, you MUST add your new folder to `next.config.ts` or you will get a runtime error like:
  - `Invalid src prop (/fonts/character8/ppt girl.png) on 'next/image' does not match 'images.localPatterns' configured in your next.config.*`
- Update `next.config.ts`:
  - Add `{ pathname: "/fonts/<your-character-id>/**" }` under `images.localPatterns`
  - Example: `{ pathname: "/fonts/character8/**" }`
- Restart the dev server after changing `next.config.ts` (config is not hot-reloaded).

2) Extend the type
- In `contexts/character-context.tsx`, update the `CharacterId` union to include your new id (e.g., `"character3"`).

3) Add the config entry
- In `CHARACTERS`, add a new object keyed by your id with:
  - `id`: the same string as your new CharacterId
  - `name`: display name (short English name)
  - `avatarPath`: path to the selector avatar (e.g., `/fonts/character3/ppt girl.png`)
  - `chatbotAvatarPath`: path to the chat avatar (e.g., `/fonts/character3/ppt_girl_chatbot.png`)
  - `glow`: SVG filter settings for the character avatar outline + breathing glow (used on home page / parallax character)
    - `color`: hex color string (e.g., `"#ff4d6d"`)
    - `outlineWidth`: outline thickness (number)
    - `glowRadius`: base glow blur radius (number)
    - `opacity`: base glow opacity (0..1)
    - `pulseSpeed`: breathing speed multiplier (number)
    - `pulseStrength`: breathing amplitude (0..1-ish; `0.2` => ±20% radius swing)
    - `opacityPulseMix`: how much opacity follows the pulse (0..1). `0` means fixed opacity.
  - `title`: short English role/title for the character (e.g., `"Visual Storytelling PPT Designer"`)
  - `tagline`: one-line English tagline (e.g., `"I turn your rough ideas into polished, presentation-ready slides."`)
  - `description`: 2–3 sentence English description of what this character is good at and their style
  - `bestFor`: array of short English strings describing ideal use cases (e.g., `["Executive presentations", "Investor decks"]`)
  - `prompts`: array of short English example queries the user can ask this character (e.g., `['"Turn this text into a 10-slide deck outline."', '"Rewrite this slide for executives."']`)
  - `systemPrompt`: full English prompt describing personality, visual style, palette, layout rules, tool usage rules, and response flow (outline → confirm → generate)

Example `glow` (copy/paste):
```ts
glow: {
  color: "#ff4d6d",
  outlineWidth: 2.5,
  glowRadius: 12,
  opacity: 0.9,
  pulseSpeed: 1.1,
  pulseStrength: 0.18,
  opacityPulseMix: 0.3,
},
```

4) Default selection (optional)
- If you want the new character to be the default, set `DEFAULT_CHARACTER` to your new id.

5) Verify usage
- Ensure any character picker or UI components read from `characters` (they map over `Object.values(CHARACTERS)`), so adding the config entry makes it appear automatically.
- Run the app and switch to the new character to confirm avatars load, prompts behave as intended, and the home page character info card shows the right English introduction.
- Home page character card shows only name/title/tagline and two `bestFor` items by default. Description, remaining `bestFor`, and `prompts` appear under "Show more", so keep those fields concise but useful.

Notes on systemPrompt
- Keep prompts in English (the image prompts must be English).
- Spell out the visual style: theme, palette, background/foreground separation, 16:9 requirement, and mandatory keywords for image generation.
- Include tool-use rules if you need outline confirmation before generation.


