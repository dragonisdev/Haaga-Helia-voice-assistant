import { headers } from 'next/headers';
import { getAppConfig } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default async function MainLayout({ children }: MainLayoutProps) {
  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);
  const { companyName, logo, logoDark } = appConfig;

  return (
    <>
      <header className="fixed top-0 left-0 z-50 flex w-full flex-row items-center justify-between px-4 py-3 md:p-6">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://haaga-helia.fi"
          className="scale-100 transition-transform duration-300 hover:scale-110"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo}
            alt={`${companyName} Logo`}
            className="block h-6 w-auto object-contain dark:hidden md:h-8"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoDark ?? logo}
            alt={`${companyName} Logo`}
            className="hidden h-6 w-auto object-contain dark:block md:h-8"
          />
        </a>
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://github.com/dragonisdev/Haaga-Helia-voice-assistant"
            className="underline underline-offset-4"
          >
            <span className="hidden sm:inline">Project Repository</span>
            <span className="sm:hidden">GitHub</span>
          </a>
        </span>
      </header>

      {children}
    </>
  );
}
