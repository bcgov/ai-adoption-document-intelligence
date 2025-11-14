import React from 'react';
import { useDocuments } from '../data/hooks/useDocuments';
import { formatDate, formatFileSize } from '../shared/utils';
import type { Document } from '../shared/types';

export const DocumentsList: React.FC = () => {
  const { data: documents, isLoading, error } = useDocuments();

  if (isLoading) {
    return (
      <div className="documents-loading">
        <p>Loading documents...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="documents-error">
        <p>Error loading documents: {error.message}</p>
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="documents-empty">
        <p>No documents found.</p>
      </div>
    );
  }

  return (
    <div className="documents-list">
      <h2>Documents ({documents.length})</h2>
      <div className="documents-grid">
        {documents.map((document: Document) => (
          <div key={document.id} className="document-card">
            <h3>{document.title}</h3>
            <div className="document-details">
              <p><strong>Filename:</strong> {document.original_filename}</p>
              <p><strong>Type:</strong> {document.file_type}</p>
              <p><strong>Size:</strong> {formatFileSize(document.file_size)}</p>
              <p><strong>Status:</strong> {document.status}</p>
              <p><strong>Created:</strong> {formatDate(new Date(document.created_at))}</p>
              {document.source && (
                <p><strong>Source:</strong> {document.source}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
