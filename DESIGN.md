---
name: Zain Sales Performance
description: A restrained operational dashboard for sales progress and team management.
colors:
  primary: "#88377f"
  primary-hover: "#6b2565"
  background: "#f6f7f8"
  ink: "#22252b"
  muted: "#636773"
  line: "#e1e3e7"
  red: "#bc2424"
  amber: "#946000"
  green: "#26733e"
  surface: "#fff"
  field-border: "#d6d2e3"
  focus: "#bd87b7"
  tag-background: "#f2e8f1"
  broadband-background: "#e0f5f3"
  broadband-ink: "#17605a"
  neutral-tag-background: "#eceaf3"
  neutral-tag-ink: "#3b3650"
  tile-background: "#f8f8f9"
  progress-track: "#f0e9ef"
  preview-background: "#f5edf4"
  auth-background: "#f3eef3"
  auth-heading: "#50244d"
  auth-body: "#674a65"
typography:
  display:
    fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif'
    fontSize: "clamp(36px, 4vw, 64px)"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif'
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  title:
    fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif'
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.45
  body:
    fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif'
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
  metric:
    fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif'
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.2
rounded:
  button: "7px"
  card: "10px"
  field: "9px"
  navigation: "8px"
  navigation-item: "5px"
  dialog: "12px"
  pill: "99px"
spacing:
  inline: "8px"
  paired-fields: "10px"
  tiles: "12px"
  grid: "16px"
  card: "18px"
  dialog: "22px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "8px 14px"
  field:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.field}"
    padding: "9px 10px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  category-tag:
    backgroundColor: "{colors.tag-background}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  navigation:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.navigation}"
    padding: "3px"
---

# Design System: Zain Sales Performance

## Overview

The existing world is a restrained Zain operational interface: white work surfaces, quiet borders, plum actions, and readable tables. The official Zain logo and brand colors are durable commitments. Keep the useful dashboard structure and its paired Postpaid and Broadband views.

This document records the final CSS cascade in `public/brand.css`, markup in `public/index.html`, and generated interface in `public/app.js`. Earlier violet declarations are superseded by later Zain overrides. This is source inspection only; no screenshots or rendered visual verification were available. No new creative metaphor is imposed on the established brand.

**Key Characteristics:**
- Compact, labeled controls and tabular numbers.
- Flat bordered cards with emphasis reserved for actions and status.
- Separate authentication and dashboard surfaces.
- Horizontal scrolling for dense operational tables.

## Colors

### Primary

Plum identifies primary actions, selected segments, category labels, and calculation emphasis. Primary hover uses the darker shade. Use the official logo asset at `/zain-logo.svg`; its source is recorded in README.

### Secondary

Broadband tags use pale teal with dark teal text. Red, amber, and green communicate target achievement: below 75%, from 75% to below 100%, and at least 100%. A missing target uses muted text. Keep numeric achievement and explanatory wording beside color.

### Neutral

White cards sit on a light gray page with ink text, muted secondary information, and fine dividers. Authentication uses pale plum with deeper plum heading and body colors. Error calculation previews use pale red (`#fee2e2`) with dark red text (`#991b1b`).

**The Final Cascade Rule.** Read the later Zain overrides as normative; do not restore the superseded violet palette when extending the interface.

## Typography

The system font stack supports fast reading without external font loading. Body text uses the body role; page headings use headline, panel headings use title, and visible form labels use label. Numbers inherit `tabular-nums` across the body.

Authentication display text is the only large expressive type. Its desktop size is fluid and becomes 32px at the mobile breakpoint. Dashboard headlines become 24px. KPI values use metric and become 22px on mobile; smaller performance tiles use bold 22px values. Dialog headings are 18px, authentication form headings are 28px, and table headers and compact actions are 12px.

## Layout

The dashboard container is centered with maximum width 1180px, horizontal padding 16px, top padding 30px, and bottom padding 36px. The white topbar is at least 76px high. Paired summaries and breakdowns use equal columns with grid spacing; today's performance uses four columns with tiles spacing. Manager controls and the team table precede the shared dashboard.

At `max-width:760px`, paired cards become a single column, performance tiles become two columns, the topbar wraps, authentication becomes one column, and container top padding becomes 22px. Account controls wrap onto a full-width row. Month navigation scrolls when necessary; history search takes available width. Paired form fields retain two columns with an 8px gap. Authentication brand padding changes from `clamp(32px,6vw,100px)` to 28px, and form padding changes from 40px to `30px 24px`.

History tables retain 960px minimum width inside a scrolling region capped at 440px high. Team tables use 660px minimum width and a 290px region cap; account and rules tables use 550px and 640px minimum widths. Sticky table headers remain white. Default dialogs fit `min(440px, calc(100% - 24px))`; rules and account dialogs widen to 860px and 800px.

## Elevation & Depth

Cards are flat, separated by borders and surrounding space. Dialogs use `0 20px 50px rgba(30,27,46,.25)` above a `rgba(30,27,46,.45)` backdrop. Toasts use a solid ink surface at bottom center; errors use the red token.

## Shapes

Use rounded tokens by component role. Fields are slightly softer than buttons; cards remain restrained. Category tags and progress tracks use pill geometry. Default controls have a 38px minimum height; compact table actions have a 30px minimum height. Search fields use 10px corners, agent selectors use 6px corners, and performance tiles use button-radius corners.

## Components

Buttons use semibold text and a fine border. Primary buttons pair plum with white, secondary buttons pair white with ink, and destructive table actions use red text. Primary hover darkens the fill; secondary hover changes the border. The transition is 0.15s. Disabled buttons show half opacity and a disabled cursor. General buttons have three-pixel plum focus rings; the more specific primary button and segment rules retain two-pixel primary-hover focus rings.

Inputs and selects retain visible labels, full-width field layout, and a 38px minimum height. Focus uses a two-pixel focus-color outline and primary-hover border. Authentication fields have 12px padding and sign-in spans the form width. Authentication uses username and an 8 to 12 digit PIN; AM791 is the main manager.

Segment navigation uses a white bordered group, quiet text by default, and a solid plum selected item. It controls month, trend, category, and sale type. Category tags differentiate Postpaid and Broadband; neutral tags identify new sales, upgrades, and rule statuses.

Cards combine their tokens with a one-pixel divider border. KPI cards show target, sales, achievement, a capped progress bar, 75% and 100% markers, and remaining or exceeded points. Breakdown rows align labels and totals. Tables use sticky headers, nowrap cells, actions, and explicit empty states. Progress width animates over 0.3s; toast opacity animates over 0.2s.

The dashboard preserves month navigation, trend, segment breakdowns, today's performance, and sales history. Managers get team overview and agent selection; all-team view disables per-agent editing. Saving makes the app inert and shows a status message. Setup or connection failures appear as explicit status text; no sample sales are displayed as live data.

## Do's and Don'ts

### Do:
- Do preserve the official Zain logo and final brand tokens.
- Do retain visible labels, keyboard focus, tabular numbers, and text alongside status colors.
- Do keep tables scrollable and responsive cards readable on narrow screens.
- Do show honest empty, saving, and unavailable states.

### Don't:
- Don't replace the operational dashboard with a promotional layout.
- Don't introduce email entry into the username and PIN workflow.
- Don't expose credentials or configuration details inside agent workflows.
- Don't treat source inspection as rendered visual verification.
