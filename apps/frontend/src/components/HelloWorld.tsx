import React from 'react';

interface HelloWorldProps {
  name?: string;
}

export const HelloWorld: React.FC<HelloWorldProps> = ({ name = 'World' }) => {
  return (
    <div>
      <h2>Hello, {name}!</h2>
      <p>Welcome to the AI OCR Frontend application.</p>
    </div>
  );
};
