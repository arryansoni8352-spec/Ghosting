import React, { useState, useEffect } from 'react';
import { Navbar, PageRoute } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { PrivacyToolsPage } from './pages/PrivacyToolsPage';
import { ResearchPage } from './pages/ResearchPage';
import { DownloadPage } from './pages/DownloadPage';
import { AboutPage } from './pages/AboutPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { SecurityPolicyPage } from './pages/SecurityPolicyPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const App: React.FC = () => {
  const getPageFromHash = (): PageRoute | 'not-found' => {
    const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    if (!hash || hash === 'home') return 'home';
    if (hash === 'privacy-tools' || hash === 'tools') return 'privacy-tools';
    if (hash === 'research' || hash === 'benchmarks') return 'research';
    if (hash === 'download' || hash === 'releases') return 'download';
    if (hash === 'about' || hash === 'project') return 'about';
    if (hash === 'privacy') return 'privacy';
    if (hash === 'security') return 'security';
    return 'not-found';
  };

  const [currentPage, setCurrentPage] = useState<PageRoute | 'not-found'>(getPageFromHash);

  // Sync hash on navigation
  const navigateTo = (page: PageRoute) => {
    setCurrentPage(page);
    window.location.hash = page === 'home' ? '' : `#${page}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      home: 'VeilGuard — Local-First Image Privacy & Adversarial Research',
      'privacy-tools': 'Browser Privacy Tools & EXIF Sanitizer — VeilGuard',
      research: 'Research Methodology & Empirical Benchmarks — VeilGuard',
      download: 'Verified Releases & Source Installation — VeilGuard',
      about: 'About Mission, Roadmap & Governance — VeilGuard',
      privacy: 'Privacy Policy — VeilGuard',
      security: 'Security Policy & Coordinated Disclosure — VeilGuard',
      'not-found': 'Page Not Found — VeilGuard',
    };
    document.title = titles[currentPage] || 'VeilGuard';
  }, [currentPage]);

  return (
    <div className="flex flex-col min-h-screen bg-navy-950 text-slate-200">
      <Navbar
        currentPage={currentPage === 'not-found' ? 'home' : currentPage}
        onNavigate={navigateTo}
      />

      <main className="flex-1" id="main-content" tabIndex={-1}>
        {currentPage === 'home' && <HomePage onNavigate={navigateTo} />}
        {currentPage === 'privacy-tools' && <PrivacyToolsPage />}
        {currentPage === 'research' && <ResearchPage />}
        {currentPage === 'download' && <DownloadPage />}
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
