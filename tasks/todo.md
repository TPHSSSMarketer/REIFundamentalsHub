# Phase 2: DeepSeek R1 Math Validation Layer

## Overview
Add `deepseek-ai/deepseek-r1` as a secondary validation model that checks the math in Kimi K2 Thinking's underwriting analysis. After K2 Thinking produces the underwriting report, DeepSeek R1 re-verifies all financial calculations and flags any errors.

## Architecture
The validation runs as a **second AI call** inside the same `/analyze` endpoint. The flow is:

1. K2 Thinking produces the underwriting analysis (existing — already working)
2. DeepSeek R1 receives the deal numbers + K2's results, then validates the math
3. If R1 finds calculation errors, they're added to `math_validation` in the response
4. If R1 confirms the math checks out, it says so
5. Both results are saved together in `underwriting_data`

**Why this approach:** The user doesn't need to click a second button or manage a separate flow. It's seamless — one click, two models work together, one result.

**Latency consideration:** This adds ~10-15 seconds. Total underwriting time goes from ~12s to ~25s. The button already says "10-15 sec" so we'll update it to "20-30 sec".

## Implementation Steps

### Step 1: Add DeepSeek R1 provider to `ai_service.py`
- Add `nvidia_deepseek_r1` to `PROVIDER_CONFIGS`
  - model: `deepseek-ai/deepseek-r1`
  - display_name: "DeepSeek R1"
  - role: "Math Validation"
- Add `"math_validation"` task type to `TASK_ROUTING` → `nvidia_deepseek_r1`
- Add to fallback chain

### Step 2: Add token pricing in `config.py`
- Add `deepseek-ai/deepseek-r1` with `0.00` pricing (free tier on NVIDIA NIM)

### Step 3: Update `underwriting_routes.py` — the core change
After the K2 Thinking call and JSON parse (line ~214), add:
- Build a validation prompt with the deal numbers + K2's JSON output
- Call `ai_complete(task_type="math_validation")` with DeepSeek R1
- Parse R1's response (a JSON validation report)
- Merge the validation results into the analysis object under `math_validation` key
- Handle R1 failures gracefully — if validation fails, still return the K2 analysis (just without validation)

**Validation prompt will ask R1 to:**
- Independently recalculate: cap rate, cash-on-cash, ROI, monthly cash flow, max allowable offer
- Compare its numbers to K2's numbers
- Flag any discrepancies with severity levels
- Return a simple JSON: `{ "validated": true/false, "checks": [...], "discrepancies": [...] }`

### Step 4: Update `AIUnderwriting.tsx` frontend
- Add `math_validation` to the `UnderwritingResult` interface
- Add a new "Math Validation" card below the existing results showing:
  - Green checkmark + "Math Verified by DeepSeek R1" if validated
  - Amber/red warnings if discrepancies found
  - List of checks performed with pass/fail icons
- Update the button text to say "20-30 sec" instead of "10-15 sec"
- Fix the old "powered by NVIDIA Nemotron AI" text to something generic

### Step 5: Update admin frontend `AiProviderSettings.tsx`
- Add DeepSeek R1 card (red "D" icon)
- Add "DeepSeek R1 (Math Validation)" test button
- Add to friendly name mapping

### Step 6: Test via admin page + real deal
- Test DeepSeek R1 standalone from admin
- Run a full underwriting analysis on a deal
- Verify both models fire and results display correctly
