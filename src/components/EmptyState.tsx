import React from 'react';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  actionText: string;
  onAction: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, actionText, onAction }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center text-gray-500 p-4">
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
        <i className="material-icons text-5xl text-gray-400">{icon}</i>
      </div>
      <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
      <p className="mt-2 text-base max-w-sm">{description}</p>
      <button
        onClick={onAction}
        className="mt-8 inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        <i className="material-icons -ml-1 mr-2">add</i>
        {actionText}
      </button>
    </div>
  );
};

export default EmptyState;
