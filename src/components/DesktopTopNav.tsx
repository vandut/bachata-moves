import React from 'react';

interface DesktopTopNavProps {
  title: string;
  rightAction?: React.ReactNode;
}

const DesktopTopNav: React.FC<DesktopTopNavProps> = ({ title, rightAction }) => {
  return (
    <div id="desktop-top-nav" className="flex justify-between items-center mb-8">
      <h1 data-component="page-title" className="text-4xl font-bold text-gray-800">{title}</h1>
      {rightAction && <div>{rightAction}</div>}
    </div>
  );
};

export default DesktopTopNav;