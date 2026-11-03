import React, { useState, useEffect } from 'react';
import { Navbar, PageRoute } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { PrivacyToolsPage } from './pages/PrivacyToolsPage';
import { VideoStudioPage } from './pages/VideoStudioPage';
import { AboutPage } from './pages/AboutPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { SecurityPolicyPage } from './pages/SecurityPolicyPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const App: React.FC = () => {
  const getPageFromHash = (): PageRoute | 'not-found' => {
    const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    if (!hash || hash === 'home') return 'home';
    if (hash === 'privacy-tools' || hash === 'tools' || hash === 'cleaner') return 'privacy-tools';
    if (hash === 'video-studio' || hash === 'video' || hash === 'video-cleaner') return 'video-studio';
    if (hash === 'about' || hash === 'project') return 'about';
    if (hash === 'privacy' || hash === 'privacy-policy') return 'privacy';
    if (hash === 'security') return 'security';
    // Graceful redirects for legacy routes
    if (hash === 'research' || hash === 'benchmarks' || hash === 'download' || hash === 'releases') {
      return 'privacy-tools';
    }
    return 'not-found';
  };

  const [currentPage, setCurrentPage] = useState<PageRoute | 'not-found'>(getPageFromHash);
  const [selectedFileForTools, setSelectedFileForTools] = useState<File | null>(null);

  // Sync hash on navigation
  const navigateTo = (page: PageRoute) => {
    setCurrentPage(page);
    window.location.hash = page === 'home' ? '' : `#${page}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHomeFileSelect = (file: File) => {
    setSelectedFileForTools(file);
    navigateTo('privacy-tools');
  };

  // Listen to browser forward/back buttons
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(getPageFromHash());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update document title dynamically
  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'GHOSTING — Minimalist Image Privacy & Metadata Sanitization',
      'privacy-tools': 'Photo Privacy & EXIF Sanitizer — GHOSTING',
      'video-studio': 'Video Privacy & Protection Studio — GHOSTING',
      about: 'About Mission & Principles — GHOSTING',
      privacy: 'Privacy Policy — GHOSTING',
      security: 'Security Policy & Reporting — GHOSTING',
      'not-found': 'Page Not Found — GHOSTING',
    };
    document.title = titles[currentPage] || 'GHOSTING';
  }, [currentPage]);

  return (
    <div className="flex flex-col min-h-screen bg-white text-neutral-900 selection:bg-neutral-900 selection:text-white">
      <Navbar
        currentPage={currentPage === 'not-found' ? 'home' : currentPage}
        onNavigate={navigateTo}
      />

      <main className="flex-1" id="main-content" tabIndex={-1}>
        {currentPage === 'home' && (
          <HomePage onNavigate={navigateTo} onFileSelect={handleHomeFileSelect} />
        )}
        {currentPage === 'privacy-tools' && (
          <PrivacyToolsPage
            initialFile={selectedFileForTools}
            onClearInitialFile={() => setSelectedFileForTools(null)}
          />
        )}
        {currentPage === 'video-studio' && <VideoStudioPage />}
        {currentPage === 'about' && <AboutPage onNavigate={navigateTo} />}
        {currentPage === 'privacy' && <PrivacyPolicyPage onNavigate={navigateTo} />}
        {currentPage === 'security' && <SecurityPolicyPage onNavigate={navigateTo} />}
        {currentPage === 'not-found' && <NotFoundPage onNavigate={navigateTo} />}
      </main>

      <Footer onNavigate={navigateTo} />
    </div>
  );
};

export default App;
