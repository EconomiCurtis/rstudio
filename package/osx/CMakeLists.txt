#
# CMakeLists.txt
#
# Copyright (C) 2021 by RStudio, PBC
#
# Unless you have received this program directly from RStudio pursuant
# to the terms of a commercial license agreement with RStudio, then
# this program is licensed to you under the terms of version 3 of the
# GNU Affero General Public License. This program is distributed WITHOUT
# ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
# MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
# AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
#
#

if(POLICY CMP0077)
   cmake_policy(SET CMP0077 NEW)
endif()

# define package suffix
set(RSTUDIO_PACKAGE_SUFFIX "-")

# flags to pass to codesign executable
set(CODESIGN_FLAGS
   "--options" "runtime"
   "--timestamp"
   "--entitlements" "${CMAKE_CURRENT_SOURCE_DIR}/entitlements.plist"
   "--deep"
   "-s" "8A388E005EF927A09B952C6E71B0E8F2F467AB26"
   "-i" "org.rstudio.RStudio")

# include overlay if it exists
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/CMakeOverlay.txt")
   include(CMakeOverlay.txt)
endif()

# developer-id code signing
if(RSTUDIO_PACKAGE_BUILD AND NOT RSESSION_ALTERNATE_BUILD)
   INSTALL(CODE "

   # if we're building on arm64, then
   # copy arm64 build components into the x86_64 build tree
   if(${UNAME_M} STREQUAL arm64)

      configure_file(
         \"${CMAKE_CURRENT_SOURCE_DIR}/build-arm64/src/cpp/session/rsession\"
         \"\${CMAKE_INSTALL_PREFIX}/RStudio.app/Contents/MacOS/rsession-arm64\"
         COPYONLY)

      set(HOMEBREW_LIBS libpq krb5 openssl sqlite3)

      foreach(LIB \${HOMEBREW_LIBS})
         set(LIBPATH \"/opt/homebrew/opt/\${LIB}/lib\")
         file(GLOB LIBFILES \"\${LIBPATH}/*.dylib\")
         foreach(LIBFILE \${LIBFILES})
            file(
               COPY \"\${LIBFILE}\"
               DESTINATION \"\${CMAKE_INSTALL_PREFIX}/RStudio.app/Contents/Frameworks/arm64\")
         endforeach()
      endforeach()

      execute_process(
         COMMAND R -s -f \"${CMAKE_CURRENT_SOURCE_DIR}/fix-arm64-library-paths.R\"
         --args
         \"\${CMAKE_INSTALL_PREFIX}/RStudio.app/Contents/Frameworks\"
         \"\${CMAKE_INSTALL_PREFIX}/RStudio.app/Contents/Frameworks/arm64\"
         COMMAND_ERROR_IS_FATAL ANY)

   endif()
   
   # don't follow symlinks in GLOB_RECURSE
   cmake_policy(SET CMP0009 NEW)
   cmake_policy(SET CMP0011 NEW)

   list(APPEND CODESIGN_TARGETS \"\${CMAKE_INSTALL_PREFIX}/RStudio.app\")

   file(GLOB_RECURSE CODESIGN_PLUGINS \"\${CMAKE_INSTALL_PREFIX}/RStudio.app/Contents/plugins\")
   list(APPEND CODESIGN_TARGETS \${CODESIGN_PLUGINS})

   file(GLOB_RECURSE CODESIGN_FRAMEWORKS \"\${CMAKE_INSTALL_PREFIX}/RStudio.app/Contents/Frameworks\")
   list(APPEND CODESIGN_TARGETS \${CODESIGN_FRAMEWORKS})

   file(GLOB_RECURSE CODESIGN_MACOS \"\${CMAKE_INSTALL_PREFIX}/RStudio.app/Contents/MacOS\")
   list(APPEND CODESIGN_TARGETS \${CODESIGN_MACOS})

   # deep sign all targets
   foreach(CODESIGN_TARGET \${CODESIGN_TARGETS})
      message(\"Signing \${CODESIGN_TARGET}...\")
      execute_process(COMMAND codesign ${CODESIGN_FLAGS} \"\${CODESIGN_TARGET}\")
   endforeach()
   ")
endif()

# package attributes
set(CPACK_PACKAGE_FILE_NAME "${CPACK_PACKAGE_NAME}${RSTUDIO_PACKAGE_SUFFIX}${CPACK_PACKAGE_VERSION}")

# create drag and drop installer
set(CPACK_BINARY_DRAGNDROP ON)

include(CPack)
