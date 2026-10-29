# VeilGuard Private Beta — Feedback Form

**Instructions**: Complete this report after testing **VeilGuard v0.1.0-rc1** on Windows.  
Submit completed reports to the private beta testing repository or maintainer channel.

> [!IMPORTANT]
> **Privacy Reminder**:
> - Do **NOT** attach personal photographs, sensitive imagery, or proprietary assets.
> - Redact local usernames and sensitive folder names from paths (e.g. `C:\Users\<user>\...`).
> - Do **NOT** include credentials, passwords, or personal account identifiers.

---

## 1. Tester & Environment

- **Tester Alias / ID**: 
- **Date Tested**: 
- **Package Tested**:
  - [ ] NSIS Installer (`VeilGuard Setup 0.1.0-rc1.exe`)
  - [ ] Portable Executable (`VeilGuard 0.1.0-rc1.exe`)
- **Operating System**: (e.g. Windows 11 Pro 23H2 / Windows 10 Home 22H2)
- **CPU**: (e.g. AMD Ryzen 7 5800H / Intel Core i5-11400)
- **Total Physical RAM**: (e.g. 8 GB / 16 GB / 32 GB)
- **Python Environment**: (e.g. Python 3.11.9 from python.org / Python 3.12 / None)
- **Security Policy Context**: (e.g. Standard personal PC / Corporate laptop with WDAC)

---

## 2. Test Scenarios Results

Please select the accurate status for each scenario:
- **MANUAL PASS**: You personally executed this action on your machine and verified success.
- **FAIL**: The scenario resulted in an error, crash, or unexpected behavior.
- **NOT VERIFIED**: You did not test this scenario.
- **BLOCKED BY POLICY**: Windows SmartScreen, WDAC, or enterprise policy blocked execution.

| # | Scenario Description | Result | Comments / Specific Observations |
|---|---|---|---|
| 1 | **Installation**: Installer/portable extracts and places shortcuts cleanly | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED  [ ] BLOCKED | |
| 2 | **App Launch**: Window opens without white flash or blank screen; About shows v0.1.0-rc1 | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED  [ ] BLOCKED | |
| 3 | **Image Ingestion**: Imports JPEG, RGB PNG, and RGBA PNG via picker and drag-and-drop | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED | |
| 4 | **Processing**: Runs Baseline and Neural Feature Disruption to completion | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED | |
| 5 | **Export**: Saves to user-specified path; opens in standard photo viewers | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED | |
| 6 | **Bound Verification**: Perturbation is visually subtle; lossless PNG holds bound | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED | |
| 7 | **Unavailable Weights**: PhotoGuard displays prerequisite notice without crash | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED | |
| 8 | **Edge Cases**: Cancellation, invalid file drops, oversized images handled gracefully | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED | |
| 9 | **Non-Destructive**: Original source files preserved 100% byte-for-byte | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED | |
| 10 | **Uninstall**: Cleanly uninstalls without affecting user exports or photos | [ ] MANUAL PASS  [ ] FAIL  [ ] NOT VERIFIED | |

---

## 3. Performance Metrics

- **Startup Time (approx)**: _____ seconds
- **Neural Feature Disruption Processing Time**: _____ seconds (for ~1 MP image)
- **Peak Memory (RAM) Consumption (via Task Manager)**: _____ MB
- **System Responsiveness during Processing**:
  - [ ] Perfectly responsive
  - [ ] Minor interface lag
  - [ ] Application window froze or became unresponsive

---

## 4. Defect & Bug Reporting

If you encountered any unexpected behavior, crashes, or visual bugs, please detail them below:

### Defect Report
- **Severity**: [ ] Blocker (App crashed)  [ ] Major (Feature failed)  [ ] Minor (Cosmetic/Typo)
- **Scenario Number**: _____
- **Steps to Reproduce**:
  1. 
  2. 
  3. 
- **Expected Outcome**:
- **Actual Outcome**:
- **Sanitized Error Log / Message**:
  ```text
  (Paste sanitized log snippet here, redacting usernames e.g. C:\Users\<user>\...)
  ```

---

## 5. UI/UX Feedback & Usability Observations

1. **Was any part of the workflow or terminology confusing?**
   > 

2. **Did the limitation notices accurately describe what the app does without false promises?**
   > 

3. **Did the app clearly communicate Python prerequisite requirements?**
   > 

---

*Privacy Confirmation: No user photographs, private credentials, or unredacted personal paths were included in this submission.*
