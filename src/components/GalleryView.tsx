import React from 'react';

// --- MUI Components (assuming they are available globally or through context) ---
// In a real project, you would import these:
// import Card from '@mui/material/Card';
// import CardContent from '@mui/material/CardContent';
// import CardActionArea from '@mui/material/CardActionArea';
// import Typography from '@mui/material/Typography';
// For this environment, we rely on a hypothetical MUI setup. We'll use standard JSX and Tailwind.

interface GalleryViewProps {
  title: string;
  itemType: string;
  itemCount: number;
}

const PlaceholderCard: React.FC<{ itemType: string; index: number }> = ({ itemType, index }) => (
  <div className="bg-white rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300">
    <div className="aspect-[9/16] bg-gray-200 flex items-center justify-center">
      <i className="material-icons text-6xl text-gray-400">ondemand_video</i>
    </div>
    <div className="p-4">
      <h3 className="text-lg font-medium text-gray-800">{itemType} {index + 1}</h3>
      <p className="text-sm text-gray-500">A short description.</p>
    </div>
  </div>
);

const AddNewCard: React.FC = () => (
   <div 
    className="
      relative 
      rounded-lg 
      border-2 border-dashed border-gray-400 
      hover:border-blue-500 hover:text-blue-500 
      transition-all duration-300 
      cursor-pointer 
      group
      bg-gray-50/50
    "
  >
    <div className="aspect-[9/16] flex items-center justify-center">
      <div className="text-center">
        <i className="material-icons text-7xl text-gray-400 group-hover:text-blue-500 transition-colors duration-300">add_circle_outline</i>
        <p className="mt-2 text-lg font-medium text-gray-600 group-hover:text-blue-500">Add New</p>
      </div>
    </div>
  </div>
);


const GalleryView: React.FC<GalleryViewProps> = ({ title, itemType, itemCount }) => {
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">{title}</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {Array.from({ length: itemCount }).map((_, index) => (
          <PlaceholderCard key={`${itemType}-${index}`} itemType={itemType} index={index} />
        ))}
        <AddNewCard />
      </div>
    </div>
  );
};

export default GalleryView;