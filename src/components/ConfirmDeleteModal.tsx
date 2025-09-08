import React from 'react';
import { useTranslation } from '../contexts/I18nContext';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  isDeleting: boolean;
  children: React.ReactNode;
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  isDeleting,
  children,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 z-[60] flex justify-center items-center p-4" // z-60 to be on top of BaseModal's z-50
      onClick={onClose}
      role="dialog"
      data-modal-name="ConfirmDeleteModal"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
             <i className="material-icons text-red-600 text-3xl" aria-hidden="true">delete_forever</i>
          </div>
          <h3 id="confirm-delete-title" className="mt-5 text-lg font-medium leading-6 text-gray-900">{title}</h3>
          <div className="mt-2 text-sm text-gray-600">
            {children}
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-3 space-y-2 space-y-reverse sm:space-y-0">
           <button
            type="button"
            onClick={onClose}
            data-action="cancel-delete"
            disabled={isDeleting}
            className="w-full sm:w-auto inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-action="confirm-delete"
            disabled={isDeleting}
            className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-red-400"
          >
            {isDeleting ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;