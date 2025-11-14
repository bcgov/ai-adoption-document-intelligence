import { useSSO } from '@bcgov/citz-imb-sso-react';

export const Login = () => {
  const { isAuthenticated, user, login, logout } = useSSO();

  if (isAuthenticated) {
    return (
      <div className="login-container">
        <h1>Welcome, {user?.first_name} {user?.last_name}</h1>
        <p>IDIR Username: {user?.originalData?.idir_username}</p>
        <p>Email: {user?.email}</p>
        <button onClick={() => logout()}>Logout</button>
      </div>
    );
  }

  return (
    <div className="login-container">
      <h1>Welcome</h1>
      <button onClick={() => login()}>Login with IDIR</button>
    </div>
  );
};
