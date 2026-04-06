import { Button } from '@/components/ui/button';

function WelcomeImage() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-primary mb-6 size-16 md:size-20"
    >
      <path
        d="M15 24V40C15 40.7957 14.6839 41.5587 14.1213 42.1213C13.5587 42.6839 12.7956 43 12 43C11.2044 43 10.4413 42.6839 9.87868 42.1213C9.31607 41.5587 9 40.7957 9 40V24C9 23.2044 9.31607 22.4413 9.87868 21.8787C10.4413 21.3161 11.2044 21 12 21C12.7956 21 13.5587 21.3161 14.1213 21.8787C14.6839 22.4413 15 23.2044 15 24ZM22 5C21.2044 5 20.4413 5.31607 19.8787 5.87868C19.3161 6.44129 19 7.20435 19 8V56C19 56.7957 19.3161 57.5587 19.8787 58.1213C20.4413 58.6839 21.2044 59 22 59C22.7956 59 23.5587 58.6839 24.1213 58.1213C24.6839 57.5587 25 56.7957 25 56V8C25 7.20435 24.6839 6.44129 24.1213 5.87868C23.5587 5.31607 22.7956 5 22 5ZM32 13C31.2044 13 30.4413 13.3161 29.8787 13.8787C29.3161 14.4413 29 15.2044 29 16V48C29 48.7957 29.3161 49.5587 29.8787 50.1213C30.4413 50.6839 31.2044 51 32 51C32.7956 51 33.5587 50.6839 34.1213 50.1213C34.6839 49.5587 35 48.7957 35 48V16C35 15.2044 34.6839 14.4413 34.1213 13.8787C33.5587 13.3161 32.7956 13 32 13ZM42 21C41.2043 21 40.4413 21.3161 39.8787 21.8787C39.3161 22.4413 39 23.2044 39 24V40C39 40.7957 39.3161 41.5587 39.8787 42.1213C40.4413 42.6839 41.2043 43 42 43C42.7957 43 43.5587 42.6839 44.1213 42.1213C44.6839 41.5587 45 40.7957 45 40V24C45 23.2044 44.6839 22.4413 44.1213 21.8787C43.5587 21.3161 42.7957 21 42 21ZM52 17C51.2043 17 50.4413 17.3161 49.8787 17.8787C49.3161 18.4413 49 19.2044 49 20V44C49 44.7957 49.3161 45.5587 49.8787 46.1213C50.4413 46.6839 51.2043 47 52 47C52.7957 47 53.5587 46.6839 54.1213 46.1213C54.6839 45.5587 55 44.7957 55 44V20C55 19.2044 54.6839 18.4413 54.1213 17.8787C53.5587 17.3161 52.7957 17 52 17Z"
        fill="currentColor"
      />
    </svg>
  );
}

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
}

export const WelcomeView = ({
  startButtonText,
  onStartCall,
  ref,
}: React.ComponentProps<'div'> & WelcomeViewProps) => {
  const handleStartCall = () => {
    onStartCall();
  };

  return (
    <div ref={ref} className="h-full flex flex-col items-center justify-center p-4">
      <section className="bg-card/90 supports-[backdrop-filter]:bg-card/80 supports-[backdrop-filter]:backdrop-blur-sm border-primary/15 flex max-w-2xl flex-col items-center justify-center rounded-3xl border px-4 py-8 text-center shadow-sm md:px-8 md:py-12">
        <WelcomeImage />

        <h1 className="text-foreground my-2 text-2xl font-bold tracking-tight md:my-4 md:text-3xl">
          Chat with Haaga-Helia Support Assistant
        </h1>

        <p className="text-muted-foreground max-w-prose text-sm md:text-base leading-relaxed font-normal mb-8 px-2 md:px-0">
          Have questions related to your studies, thesis or even for what is for lunch today? Ask
          our AI in your own native language!
        </p>

        <Button
          size="lg"
          onClick={handleStartCall}
          className="w-full max-w-[280px] sm:w-72 rounded-full font-semibold md:text-base tracking-wide hover:cursor-pointer shadow-sm md:shadow transition-all hover:scale-105 active:scale-95"
        >
          {startButtonText}
        </Button>
      </section>

      <div className="fixed bottom-6 left-0 flex w-full items-center justify-center px-4">
        <p className="text-muted-foreground text-xs leading-5 font-normal md:text-sm text-center">
          See how we process your data:{' '}
          <a href="/privacy" className="underline hover:text-foreground transition-colors">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
};
