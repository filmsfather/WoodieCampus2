import { Link, useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  BarChart3, 
  Settings, 
  LogOut, 
  User,
  Menu,
  X,
  Shield,
  Users
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState } from 'react';

export function Navbar() {
  const { user, logout, isAdmin, isInstructor } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!user) {
    return null;
  }

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  return (
    <nav className="bg-white shadow-lg border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <BookOpen className="h-8 w-8 text-primary-600 mr-2" />
              <span className="text-xl font-bold text-gray-900">
                WoodieCampus
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:space-x-8">
            <Link
              to="/dashboard"
              className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <BarChart3 className="h-4 w-4 inline mr-1" />
              대시보드
            </Link>

            <Link
              to="/problems"
              className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <BookOpen className="h-4 w-4 inline mr-1" />
              문제 풀이
            </Link>

            {(isAdmin || isInstructor) && (
              <Link
                to="/admin/problems"
                className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <Settings className="h-4 w-4 inline mr-1" />
                문제 관리
              </Link>
            )}

            {isAdmin && (
              <Link
                to="/admin/users"
                className="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <Users className="h-4 w-4 inline mr-1" />
                사용자 관리
              </Link>
            )}
          </div>

          {/* User Menu */}
          <div className="hidden md:flex md:items-center md:space-x-4">
            <div className="relative group">
              <button className="flex items-center text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
                <User className="h-4 w-4 mr-1" />
                {user.name}
                {isAdmin && <Shield className="h-3 w-3 ml-1 text-purple-600" />}
              </button>
              
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <Link
                  to="/profile"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  프로필
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <LogOut className="h-4 w-4 inline mr-2" />
                  로그아웃
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={toggleMenu}
              className="text-gray-700 hover:text-primary-600 focus:outline-none focus:text-primary-600"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t">
              <Link
                to="/dashboard"
                onClick={() => setIsMenuOpen(false)}
                className="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
              >
                <BarChart3 className="h-4 w-4 inline mr-2" />
                대시보드
              </Link>

              <Link
                to="/problems"
                onClick={() => setIsMenuOpen(false)}
                className="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
              >
                <BookOpen className="h-4 w-4 inline mr-2" />
                문제 풀이
              </Link>

              {(isAdmin || isInstructor) && (
                <Link
                  to="/admin/problems"
                  onClick={() => setIsMenuOpen(false)}
                  className="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
                >
                  <Settings className="h-4 w-4 inline mr-2" />
                  문제 관리
                </Link>
              )}

              {isAdmin && (
                <Link
                  to="/admin/users"
                  onClick={() => setIsMenuOpen(false)}
                  className="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
                >
                  <Users className="h-4 w-4 inline mr-2" />
                  사용자 관리
                </Link>
              )}

              <Link
                to="/profile"
                onClick={() => setIsMenuOpen(false)}
                className="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
              >
                <User className="h-4 w-4 inline mr-2" />
                프로필
              </Link>

              <button
                onClick={() => {
                  handleLogout();
                  setIsMenuOpen(false);
                }}
                className="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium w-full text-left"
              >
                <LogOut className="h-4 w-4 inline mr-2" />
                로그아웃
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}