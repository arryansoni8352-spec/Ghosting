import { useState, useCallback, useEffect } from "react";
import "./styles/app.css";
import type { ImageMetadata } from "../../../packages/engine-interface/src/types";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ImageWorkspace } from "./components/ImageWorkspace";
import { StatusBar } from "./components/StatusBar";
import { AboutDialog } from "./components/AboutDialog";
import { useEngineHealth } from "./hooks/useEngineHealth";

export type AppView = "welcome" | "workspace";

export default function App() {
  const [view, setView] = useState<AppView>("welcome");
  const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("0.1.0-rc1");
  const engineHealth = useEngineHealth();

  useEffect(() => {
    window.veilguard?.getAppVersion?.().then((v: string) => {
      if (v) setAppVersion(v);
    }).catch(() => {});
  }, []);

  const handleImageSelected = useCallback((meta: ImageMetadata) => {
    setSelectedImage(meta);
    setView("workspace");
  }, []);

  const handleBackToWelcome = useCallback(() => {
    setSelectedImage(null);
    setView("welcome");
  }, []);

  // Handle drag-and-drop at the app level
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <div className="app-root">
      <Titlebar />
      <div className="app-body">
        <Sidebar
          currentView={view}
          onNavigate={(v) => {
            if (v === "welcome") handleBackToWelcome();
          }}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
        <main className="app-main" role="main">
          {view === "welcome" && (
            <WelcomeScreen
              onImageSelected={handleImageSelected}
              engineHealth={engineHealth}
            />
          )}
          {view === "workspace" && selectedImage && (
            <ImageWorkspace
              imageMetadata={selectedImage}
              onBack={handleBackToWelcome}
              engineHealth={engineHealth}
            />
          )}
        </main>
      </div>
      <StatusBar engineHealth={engineHealth} />
      <AboutDialog
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        appVersion={appVersion}
      />
    </div>
  );
}
