import React from 'react';
import { cn } from '@/lib/utils/cn';

interface FacebookLoginButtonProps {
  onAuth: () => void;
  buttonText?: string;
  className?: string;
}

export const FacebookLoginButton: React.FC<FacebookLoginButtonProps> = ({
  onAuth,
  buttonText = 'Continue with Facebook',
  className,
}) => {
  return (
    <button
      onClick={onAuth}
      className={cn(
        "flex items-center justify-center gap-3 w-full max-w-[300px] h-12 rounded-[16px] bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold transition-all duration-300 shadow-[0_4px_14px_rgba(24,119,242,0.3)] hover:shadow-[0_6px_20px_rgba(24,119,242,0.4)] active:scale-95",
        className
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        className="fill-white"
      >
        <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-1.125 0-2.517.236-2.517 1.428v2.547h3.739l-.473 3.667h-3.266v7.98h-4.564z" />
      </svg>
      <span className="text-[15px]">{buttonText}</span>
    </button>
  );
};
