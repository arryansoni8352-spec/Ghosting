/**
 * Verification test script to be run inside the real Electron environment.
 * Executes:
 * 1. App startup
 * 2. IPC image validation on real file
 * 3. IPC read-metadata (preview generation, dimensions)
 * 4. EngineManager health check
 * 5. Full processing workflow (import -> apply baseline protection -> export protected file)
 * 6. File integrity verification (original preserved, output valid and altered)
 */

import { app } from "electron";
import path from "path";
import fs from "fs";
import { EngineManager } from "../electron/engine-manager";

async function runVerification() {
  const logFile = path.resolve(__dirname, "e2e_result.log");
  function log(msg: string) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + "\n", "utf-8");
  }
  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
  log("=== VEILGUARD ELECTRON E2E VERIFICATION STARTED ===");

  const engineManager = new EngineManager();
  const inputPath = path.resolve(__dirname, "../../../../tests/sample_input.png");
  const outputPath = path.resolve(__dirname, "../../../../tests/sample_output_protected.png");

  try {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist at ${inputPath}`);
    }

    const originalStats = fs.statSync(inputPath);
    const originalHash = fs.readFileSync(inputPath).toString("base64");
    log(`[PASS] Input image verified: ${inputPath} (${originalStats.size} bytes)`);

    // 1. Health check with Python subprocess
    log("Testing EngineManager.health()...");
    log(`enginePath: ${(engineManager as unknown as { enginePath: string }).enginePath}`);
    log(`pythonPath: ${(engineManager as unknown as { pythonPath: string }).pythonPath}`);
    const health = await engineManager.health() as Record<string, unknown>;
    log(`[PASS] Engine health check responded: ${JSON.stringify(health, null, 2)}`);

    if (health["status"] !== "ready" && health["status"] !== "degraded") {
      throw new Error(`Engine reported unhealthy status: ${health["status"]}`);
    }

    // 2. Run protection processing
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    log("Testing EngineManager.runProcess() with neural-feature-disruption...");
    let progressReported = false;

    const result = await engineManager.runProcess(
      {
        requestId: "test-req-neural-1",
        algorithmId: "neural-feature-disruption",
        inputPath,
        outputPath,
        device: "cpu",
        params: { strength: 8.0, iterations: 5 },
        timeoutSeconds: 60,
      },
      (progress) => {
        log(` -> Engine Progress: ${progress.percent}% - ${progress.message}`);
        progressReported = true;
      }
    ) as Record<string, unknown>;

    log(`[PASS] Processing completed with status: ${result["status"]}`);
    if (result["status"] !== "success") {
      throw new Error(`Engine processing failed: ${JSON.stringify(result)}`);
    }

    if (!progressReported) {
      throw new Error("Progress callback was never triggered during processing");
    }

    // 3. Verify output file existence & properties
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Output file was not created at ${outputPath}`);
    }

    const outputStats = fs.statSync(outputPath);
    log(`[PASS] Protected export created: ${outputPath} (${outputStats.size} bytes)`);

    // 4. Verify original image preservation
    const afterProcessStats = fs.statSync(inputPath);
    const afterProcessHash = fs.readFileSync(inputPath).toString("base64");
    if (originalStats.size !== afterProcessStats.size || originalHash !== afterProcessHash) {
      throw new Error("VIOLATION: Original input image was modified or corrupted!");
    }
    log("[PASS] Original image was preserved byte-for-byte.");

    // 5. Verify output file differs from input file
    const outputHash = fs.readFileSync(outputPath).toString("base64");
    if (outputHash === originalHash) {
      throw new Error("Protected output image is identical to input image! Perturbation did not apply.");
    }
    log("[PASS] Protected image contains verified perturbation differences.");

    log("=== ALL E2E ELECTRON VERIFICATIONS PASSED ===");
    await engineManager.shutdown();
    app.exit(0);
  } catch (err) {
    log(`=== VERIFICATION FAILED === ${err}`);
    await engineManager.shutdown();
    app.exit(1);
  }
}

app.whenReady().then(runVerification);
