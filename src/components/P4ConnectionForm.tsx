import { useState, FormEvent } from 'react';

type P4ConnectionFormProps = {
  onConnect: (config: P4Config) => void;
  isLoading?: boolean;
};

export interface P4Config {
  port: string;
  user: string;
  password: string;
  client?: string;
  clientRoot?: string;
}

export default function P4ConnectionForm({ onConnect, isLoading = false }: P4ConnectionFormProps) {
  const [config, setConfig] = useState<P4Config>({
    port: '',
    user: '',
    password: '',
    client: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onConnect(config);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="port" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Perforce Server (host:port)
        </label>
        <input
          id="port"
          name="port"
          type="text"
          required
          value={config.port}
          onChange={handleChange}
          className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded-md shadow-sm py-2 px-3 
                   bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none 
                   focus:ring-primary-500 focus:border-primary-500"
          placeholder="perforce:1666"
        />
      </div>

      <div>
        <label htmlFor="user" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Username
        </label>
        <input
          id="user"
          name="user"
          type="text"
          required
          value={config.user}
          onChange={handleChange}
          className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded-md shadow-sm py-2 px-3 
                   bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none 
                   focus:ring-primary-500 focus:border-primary-500"
          placeholder="username"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          value={config.password}
          onChange={handleChange}
          className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded-md shadow-sm py-2 px-3 
                   bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none 
                   focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      <div>
        <label htmlFor="client" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Workspace (Client) Name
        </label>
        <input
          id="client"
          name="client"
          type="text"
          value={config.client}
          onChange={handleChange}
          className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded-md shadow-sm py-2 px-3 
                   bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none 
                   focus:ring-primary-500 focus:border-primary-500"
          placeholder="Optional"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium 
                text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 
                focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Connecting...' : 'Connect to Perforce'}
      </button>
    </form>
  );
} 