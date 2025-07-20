import React from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MobileTopNav from './MobileTopNav';
import DesktopTopNav from './DesktopTopNav';

const SettingsView: React.FC = () => {
  const isMobile = useMediaQuery('(max-width: 768px)');

  return (
    <>
      {isMobile ? <MobileTopNav title="Settings" /> : null}
      <div className="p-4 md:p-8">
        {!isMobile && <DesktopTopNav title="Settings" />}
        <div className="bg-white p-6 rounded-lg shadow-md max-w-2xl">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-700">Profile</h2>
              <p className="text-gray-500 mt-1">Update your profile information.</p>
              <button className="mt-3 bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 transition-colors">
                Edit Profile
              </button>
            </div>
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-xl font-semibold text-gray-700">Notifications</h2>
              <p className="text-gray-500 mt-1">Manage your notification preferences.</p>
               <div className="flex items-center justify-between mt-4">
                  <span className="text-gray-700">Email Notifications</span>
                  <div className="w-12 h-6 flex items-center bg-gray-300 rounded-full p-1 duration-300 ease-in-out cursor-pointer">
                      <div className="bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out"></div>
                  </div>
              </div>
            </div>
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-xl font-semibold text-gray-700">Account</h2>
              <p className="text-gray-500 mt-1">Manage your account settings.</p>
              <button className="mt-3 bg-red-500 text-white font-bold py-2 px-4 rounded hover:bg-red-700 transition-colors">
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsView;